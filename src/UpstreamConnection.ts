import IConnection from './IConnection.js';
import { InetAddress } from './jsprismarine/packages/raknet/src/RakNet.js';
import ProxyServer from './ProxyServer.js';
import TempInetAddress from './TempInetAddress.js';

export default class UpstreamConnection implements IConnection {
    private address: InetAddress;
    private server: ProxyServer;
    // For connected mean handled offline packets
    private connected: boolean = false;

    public lastPingTime: number;
    public lastCachedPong: Buffer;

    public constructor(address: string, port: number, server: ProxyServer) {
        this.address = new TempInetAddress(address, port);
        this.server = server;
        
        this.lastPingTime = Date.now();
        this.lastCachedPong = Buffer.alloc(0);
    }

    public setConnected(val: boolean = true): void {
        this.connected = val;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public getAddress(): InetAddress {
        return this.address;
    }
}