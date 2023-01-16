import { InetAddress } from './jsprismarine/packages/raknet/src/RakNet.js';

export default interface IConnection {
    getAddress(): InetAddress;
}