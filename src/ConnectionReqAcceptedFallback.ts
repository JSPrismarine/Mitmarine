import { Protocol, InetAddress } from './jsprismarine/packages/raknet/src/RakNet.js';

export default class ConnectionReqAcceptedFallback extends Protocol.ConnectionRequestAccepted {
    public override decodePayload(): void {
        this.clientAddress = this.readAddress();
        this.readShort(); // Unknown
        for (let i = 0; i < 10; i++) {
            this.readAddress();
        }

        this.requestTimestamp = this.readLong();
        this.acceptedTimestamp = this.readLong();   
    }

    public encodePayload(): void {
        this.writeAddress(this.clientAddress);
        this.writeShort(0); // Unknown
        const sysAddresses = [new InetAddress('127.0.0.1', 0, 4)];
        for (let i = 0; i < 10; i++) {
            this.writeAddress(sysAddresses[i] ?? new InetAddress('0.0.0.0', 0, 4));
        }

        this.writeLong(this.requestTimestamp);
        this.writeLong(this.acceptedTimestamp);
    }
}