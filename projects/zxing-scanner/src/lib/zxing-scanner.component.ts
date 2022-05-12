import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { BrowserCodeReader } from '@zxing/browser';
import {
  BarcodeFormat,
  DecodeHintType,
  Exception,
  Result
} from '@zxing/library';
import { Subscription } from 'rxjs';
import { BrowserMultiFormatContinuousReader } from './browser-multi-format-continuous-reader';
import { ResultAndError } from './ResultAndError';


@Component({
  selector: 'zxing-scanner',
  templateUrl: './zxing-scanner.component.html',
  styleUrls: ['./zxing-scanner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZXingScannerComponent implements OnInit, OnDestroy {

  /**
   * Mapa de sugerencias admitida.
   */
  private _hints: Map<DecodeHintType, any> | null;

  /**
   * El lector de código ZXing.
   */
  private _codeReader: BrowserMultiFormatContinuousReader;

  /**
   * El dispositivo que debería usarse para escanear cosas.
   */
  private _device: MediaDeviceInfo;

  /**
   * El dispositivo que debería usarse para escanear cosas.
   */
  private _enabled: boolean;


  private _isAutostarting: boolean;

  /**
   * Tiene acceso de `navegador`.
   */
  private hasNavigator: boolean;

  /**
   * Dice si se admite alguna API nativa.
   */
  private isMediaDevicesSupported: boolean;

  /**
   * 
     Si el user-agent permitió o no el uso de la cámara
   */
  private hasPermission: boolean | null;

  /**
   * Darse de baja para dejar de escanear el uso de la cámara.
   */
  private _scanSubscription?: Subscription;

  /**
   * La referencia al elemento de vista previa debe ser la etiqueta `video`
   */
  @ViewChild('preview', { static: true })
  previewElemRef: ElementRef<HTMLVideoElement>;

  /**
   * Habilite o deshabilite el enfoque automático de la cámara (puede tener un impacto en el rendimiento)
   */
  @Input()
  autofocusEnabled: boolean;

  /**
   * Retraso entre intentos de decodificación (el valor predeterminado es 500 ms)
   */
  @Input()
  timeBetweenScans = 500;

  /**
   * Retraso entre decodificación exitosa (el valor predeterminado es 500 ms)
   */
  @Input()
  delayBetweenScanSuccess = 500;

  /**
   * Se emite cuando y si el escáner se inicia automáticamente.
   */
  @Output()
  autostarted: EventEmitter<void>;

  
  @Output()
  autostarting: EventEmitter<boolean>;

 
  @Input()
  autostart: boolean;

 
  @Input()
  previewFitMode: 'fill' | 'contain' | 'cover' | 'scale-down' | 'none' = 'cover';


  @Output()
  torchCompatible: EventEmitter<boolean>;


  @Output()
  scanSuccess: EventEmitter<string>;


  @Output()
  scanFailure: EventEmitter<Exception | undefined>;


  @Output()
  scanError: EventEmitter<Error>;


  @Output()
  scanComplete: EventEmitter<Result>;


  @Output()
  camerasFound: EventEmitter<MediaDeviceInfo[]>;


  @Output()
  camerasNotFound: EventEmitter<any>;


  @Output()
  permissionResponse: EventEmitter<boolean>;


  @Output()
  hasDevices: EventEmitter<boolean>;

  private _ready = false;

  private _devicePreStart: MediaDeviceInfo;


  get codeReader(): BrowserMultiFormatContinuousReader {
    return this._codeReader;
  }

 
  @Input()
  set device(device: MediaDeviceInfo | undefined) {

    if (!this._ready) {
      this._devicePreStart = device;
   
      return;
    }

    if (this.isAutostarting) {
           console.warn('Avoid setting a device during auto-start.');
      return;
    }

    if (this.isCurrentDevice(device)) {
      console.warn('Setting the same device is not allowed.');
      return;
    }

    if (!this.hasPermission) {
      console.warn('Permissions not set yet, waiting for them to be set to apply device change.');
     
      return;
    }

    this.setDevice(device);
  }

  
  @Output()
  deviceChange: EventEmitter<MediaDeviceInfo>;

 
  get device() {
    return this._device;
  }

  
  get formats(): BarcodeFormat[] {
    return this.hints.get(DecodeHintType.POSSIBLE_FORMATS);
  }

  
 
  @Input()
  set formats(input: BarcodeFormat[]) {

    if (typeof input === 'string') {
      throw new Error('Invalid formats, make sure the [formats] input is a binding.');
    }

      const formats = input.map(f => this.getBarcodeFormatOrFail(f));

    const hints = this.hints;

  
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

   
    this.hints = hints;
  }

  
  get hints() {
    return this._hints;
  }

 
  set hints(hints: Map<DecodeHintType, any>) {
    this._hints = hints;
   
    this.codeReader?.setHints(this._hints);
  }


  @Input()
  set videoConstraints(constraints: MediaTrackConstraints) {
   
    const controls = this.codeReader?.getScannerControls();

    if (!controls) {
      
      return;
    }

    controls?.streamVideoConstraintsApply(constraints);
  }

 
  set isAutostarting(state: boolean) {
    this._isAutostarting = state;
    this.autostarting.next(state);
  }

  /**
   *
   */
  get isAutostarting(): boolean {
    return this._isAutostarting;
  }

/**
   * Puede encender/apagar la linterna del dispositivo.
   *
   * Las API de @experimental Torch/Flash no son estables en todos los navegadores, ¡pueden tener errores!
   */

  @Input()
  set torch(onOff: boolean) {
    try {
      const controls = this.getCodeReader().getScannerControls();
      controls.switchTorch(onOff);
    } catch (error) {
      
    }
  }

  /**
   * Inicia y detiene el escaneo.
   */
  @Input()
  set enable(enabled: boolean) {

    this._enabled = Boolean(enabled);

    if (!this._enabled) {
      this.reset();
      BrowserMultiFormatContinuousReader.releaseAllStreams();
    } else {
      if (this.device) {
        this.scanFromDevice(this.device.deviceId);
      } else {
        this.init();
      }
    }
  }

  /**
   * Indica si el escáner está habilitado o no.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   *Si está habilitado `tryHarder.
   */
  get tryHarder(): boolean {
    return this.hints.get(DecodeHintType.TRY_HARDER);
  }

  /**
   * Habilitar/deshabilitar la sugerencia tryHarder.
   */
  @Input()
  set tryHarder(enable: boolean) {

    const hints = this.hints;

    if (enable) {
      hints.set(DecodeHintType.TRY_HARDER, true);
    } else {
      hints.delete(DecodeHintType.TRY_HARDER);
    }

    this.hints = hints;
  }

  /**
   * Constructor para construir el objeto y hacer DI.
   */
  constructor() {
    // emisores basados ​​en instancias
    this.autostarted = new EventEmitter();
    this.autostarting = new EventEmitter();
    this.torchCompatible = new EventEmitter(false);
    this.scanSuccess = new EventEmitter();
    this.scanFailure = new EventEmitter();
    this.scanError = new EventEmitter();
    this.scanComplete = new EventEmitter();
    this.camerasFound = new EventEmitter();
    this.camerasNotFound = new EventEmitter();
    this.permissionResponse = new EventEmitter(true);
    this.hasDevices = new EventEmitter();
    this.deviceChange = new EventEmitter();

    this._enabled = true;
    this._hints = new Map<DecodeHintType, any>();
    this.autofocusEnabled = true;
    this.autostart = true;
    this.formats = [BarcodeFormat.QR_CODE];

   
    this.hasNavigator = typeof navigator !== 'undefined';
    this.isMediaDevicesSupported = this.hasNavigator && !!navigator.mediaDevices;
  }

  
  async askForPermission(): Promise<boolean> {

    if (!this.hasNavigator) {
      console.error('@zxing/ngx-scanner', 'Can\'t ask permission, navigator is not present.');
      this.setPermission(null);
      return this.hasPermission;
    }

    if (!this.isMediaDevicesSupported) {
      console.error('@zxing/ngx-scanner', 'Can\'t get user media, this is not supported.');
      this.setPermission(null);
      return this.hasPermission;
    }

    let stream: MediaStream;
    let permission: boolean;

    try {
    
      stream = await this.getAnyVideoDevice();
      permission = !!stream;
    } catch (err) {
      return this.handlePermissionException(err);
    } finally {
      this.terminateStream(stream);
    }

    this.setPermission(permission);

   
    return permission;
  }


  getAnyVideoDevice(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ video: true });
  }

  
  private terminateStream(stream: MediaStream) {

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    stream = undefined;
  }

  private async init() {
    if (!this.autostart) {
      console.warn('Feature \'autostart\' disabled. Permissions and devices recovery has to be run manually.');

      // hace la configuración necesaria sin autoarranque
      this.initAutostartOff();

      this._ready = true;

      return;
    }

   
    await this.initAutostartOn();

    this._ready = true;
  }

  /**
   * Inicializa el componente sin iniciar el escáner.
   */
  private initAutostartOff(): void {

    // no pedir permiso cuando el inicio automático está desactivado
    this.isAutostarting = false;

    // solo actualice la información de los dispositivos
    this.updateVideoInputDevices();

    if (this._device && this._devicePreStart) {
      this.setDevice(this._devicePreStart);
    }
  }

  /**
   * Inicializa el componente e inicia el escáner.
   * Se piden permisos para lograr eso.
   */
  private async initAutostartOn(): Promise<void> {

    this.isAutostarting = true;

    let hasPermission: boolean;

    try {
      // Pide permiso antes de enumerar dispositivos para poder obtener toda la información del dispositivo
      hasPermission = await this.askForPermission();
    } catch (e) {
      console.error('Exception occurred while asking for permission:', e);
      return;
    }

    
    if (hasPermission) {
      const devices = await this.updateVideoInputDevices();
      await this.autostartScanner([...devices]);
    }

    this.isAutostarting = false;
    this.autostarted.next();
  }

 
  isCurrentDevice(device?: MediaDeviceInfo) {
    return device?.deviceId === this._device?.deviceId;
  }

 
  ngOnDestroy(): void {
    this.reset();
    BrowserMultiFormatContinuousReader.releaseAllStreams();
  }


  ngOnInit(): void {
    this.init();
  }


  public scanStop() {
    if (this._scanSubscription) {
      this.codeReader?.getScannerControls().stop();
      this._scanSubscription?.unsubscribe();
      this._scanSubscription = undefined;
    }
    this.torchCompatible.next(false);
  }

 
  public scanStart() {

    if (this._scanSubscription) {
      throw new Error('There is already a scan process running.');
    }

    if (!this._device) {
      throw new Error('No device defined, cannot start scan, please define a device.');
    }

    this.scanFromDevice(this._device.deviceId);
  }


  restart(): void {
    
    this._codeReader = undefined;

    const prevDevice = this._reset();

    if (!prevDevice) {
      return;
    }

    this.device = prevDevice;
  }

 
  async updateVideoInputDevices(): Promise<MediaDeviceInfo[]> {

    
    const devices = await BrowserCodeReader.listVideoInputDevices() || [];
    const hasDevices = devices && devices.length > 0;

    
    this.hasDevices.next(hasDevices);
    this.camerasFound.next([...devices]);

    if (!hasDevices) {
      this.camerasNotFound.next(null);
    }

    return devices;
  }

 
  private async autostartScanner(devices: MediaDeviceInfo[]): Promise<void> {

    const matcher = ({ label }) => /back|trás|rear|traseira|environment|ambiente/gi.test(label);

    
    const device = devices.find(matcher) || devices.pop();

    if (!device) {
      throw new Error('Impossible to autostart, no input devices available.');
    }

    await this.setDevice(device);

    this.deviceChange.next(device);
  }

 
  private dispatchScanSuccess(result: Result): void {
    this.scanSuccess.next(result.getText());
  }


  private dispatchScanFailure(reason?: Exception): void {
    this.scanFailure.next(reason);
  }


  private dispatchScanError(error: any): void {
    if (!this.scanError.observed) {
      console.error(`zxing scanner component: ${error.name}`, error);
      console.warn('Use the `(scanError)` property to handle errors like this!');
    }
    this.scanError.next(error);
  }


  private dispatchScanComplete(result: Result): void {
    this.scanComplete.next(result);
  }


  private handlePermissionException(err: DOMException): boolean {

    
    console.error('@zxing/ngx-scanner', 'Error when asking for permission.', err);

    let permission: boolean;

    switch (err.name) {

    
      case 'NotSupportedError':
        console.warn('@zxing/ngx-scanner', err.message);
        
        permission = null;
        
        this.hasDevices.next(null);
        break;


      case 'NotAllowedError':
        console.warn('@zxing/ngx-scanner', err.message);
        
        permission = false;
        
        this.hasDevices.next(true);
        break;

      
      case 'NotFoundError':
        console.warn('@zxing/ngx-scanner', err.message);
        
        permission = null;
        
        this.hasDevices.next(false);
        
        this.camerasNotFound.next(err);
        break;

      case 'NotReadableError':
        console.warn('@zxing/ngx-scanner', 'Couldn\'t read the device(s)\'s stream, it\'s probably in use by another app.');
        
        permission = null;
        
        this.hasDevices.next(false);
        /
        this.camerasNotFound.next(err);
        break;

      default:
        console.warn('@zxing/ngx-scanner', 'I was not able to define if I have permissions for camera or not.', err);
        
        permission = null;
        
        break;

    }

    this.setPermission(permission);

   
    this.permissionResponse.error(err);

    return permission;
  }

 
  private getBarcodeFormatOrFail(format: string | BarcodeFormat): BarcodeFormat {
    return typeof format === 'string'
      ? BarcodeFormat[format.trim().toUpperCase()]
      : format;
  }

 
  private getCodeReader(): BrowserMultiFormatContinuousReader {

    if (!this._codeReader) {
      const options = {
        delayBetweenScanAttempts: this.timeBetweenScans,
        delayBetweenScanSuccess: this.delayBetweenScanSuccess,
      };
      this._codeReader = new BrowserMultiFormatContinuousReader(this.hints, options);
    }

    return this._codeReader;
  }

 
  private async scanFromDevice(deviceId: string): Promise<void> {

    const videoElement = this.previewElemRef.nativeElement;

    const codeReader = this.getCodeReader();

    const scanStream = await codeReader.scanFromDeviceObservable(deviceId, videoElement);

    if (!scanStream) {
      throw new Error('Undefined decoding stream, aborting.');
    }

    const next = (x: ResultAndError) => this._onDecodeResult(x.result, x.error);
    const error = (err: any) => this._onDecodeError(err);
    const complete = () => { };

    this._scanSubscription = scanStream.subscribe(next, error, complete);

    if (this._scanSubscription.closed) {
      return;
    }

    const controls = codeReader.getScannerControls();
    const hasTorchControl = typeof controls.switchTorch !== 'undefined';

    this.torchCompatible.next(hasTorchControl);
  }


  private _onDecodeError(err: any) {
    this.dispatchScanError(err);
    
  }

  
  private _onDecodeResult(result: Result, error: Exception): void {

    if (result) {
      this.dispatchScanSuccess(result);
    } else {
      this.dispatchScanFailure(error);
    }

    this.dispatchScanComplete(result);
  }

 
  private _reset(): MediaDeviceInfo {

    if (!this._codeReader) {
      return;
    }

    const device = this._device;
    
    this.device = undefined;

    this._codeReader = undefined;

    return device;
  }

  
  public reset(): void {
    this._reset();
    this.deviceChange.emit(null);
  }

  
  private async setDevice(device: MediaDeviceInfo): Promise<void> {

    
    this.scanStop();

   
    this._device = device || undefined;

    if (!this._device) {
     
      BrowserCodeReader.cleanVideoSource(this.previewElemRef.nativeElement);
    }

   
    if (this._enabled && device) {
      await this.scanFromDevice(device.deviceId);
    }
  }

 
  private setPermission(hasPermission: boolean | null): void {
    this.hasPermission = hasPermission;
    this.permissionResponse.next(hasPermission);
  }

}
