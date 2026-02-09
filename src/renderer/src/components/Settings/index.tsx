import React, { useEffect, useState } from 'react';
import { useSoundboardStore } from '../../lib/store';
import QRCode from 'qrcode';
import Download from '../Download';

const Settings: React.FC = () => {
  const { monitorDevice, outputDevice, setMonitorDevice, setOutputDevice } = useSoundboardStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [qrCode, setQrCode] = useState<string>('');

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const audioOutputDevices = devices.filter(
        (device) => device.kind === 'audiooutput'
      );
      setDevices(audioOutputDevices);
    });

    window.api.getLocalIp().then((ips) => {
      const ip = Object.values(ips).flat()[0];
      if (ip) {
        QRCode.toDataURL(`http://${ip}:8080`).then(setQrCode);
      }
    });
  }, []);

  return (
    <div className="p-4 text-white">
      <h1 className="text-2xl mb-4">Settings</h1>
      <div className="flex flex-col space-y-4">
        <div>
          <label className="block mb-2">Monitor Device</label>
          <select
            value={monitorDevice || ''}
            onChange={(e) => setMonitorDevice(e.target.value)}
            className="w-full p-2 bg-gray-700 rounded"
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-2">Output Device</label>
          <select
            value={outputDevice || ''}
            onChange={(e) => setOutputDevice(e.target.value)}
            className="w-full p-2 bg-gray-700 rounded"
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
        <Download />
        <div>
          <label className="block mb-2">Remote Control QR Code</label>
          {qrCode && <img src={qrCode} alt="QR Code" />}
        </div>
      </div>
    </div>
  );
};

export default Settings;