import { InetAddress } from './jsprismarine/packages/raknet/src/RakNet.js';

export default class TempInetAddress extends InetAddress {
    
    public equals(inetAddr: InetAddress): boolean {
        return this.getAddress() === inetAddr.getAddress() && this.getPort() === inetAddr.getPort();
    }
}