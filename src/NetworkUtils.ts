import BinaryStream from '@jsprismarine/jsbinaryutils/dist/BinaryStream';
import { EncapsulatedPacket, DataPacket, ACK, NACK, BitFlags } from '@jsprismarine/raknet/dist/protocol/Protocol';
import IConnection from './IConnection';
import PacketRegistry from '@jsprismarine/prismarine/dist/network/PacketRegistry';
import ProxyServer from './ProxyServer';
import Server from '@jsprismarine/prismarine/dist/Server';
import TempBatchPacket from './TempBatchPacket';

export default class NetworkUtils {
    private proxyServer: ProxyServer;

    public sendSeqNumber: number = 0;

    private acks: ACK[] = [];
    private nacks: NACK[] = [];

    private splits: Map<number, Map<number, EncapsulatedPacket>> = new Map();

    private packetRegistry: PacketRegistry;

    public constructor(proxyServer: ProxyServer) {
        this.proxyServer = proxyServer;
        // TODO: server interface in JSPrismarine
        this.packetRegistry = new PacketRegistry((this.proxyServer as any) as Server);
    }

    public writePacket(buffer: Buffer, connection: IConnection) {
        const inetAddr = connection.getAddress();
        this.proxyServer.getSocket().send(buffer, 0, buffer.length, inetAddr.getPort(), inetAddr.getAddress());
    }

    public readDataPacket(buffer: Buffer): DataPacket | null {
        const pid = buffer[0];
        // Check if is not a offline packet
        if ((pid & BitFlags.VALID) !== 0) {
            if (pid & BitFlags.ACK) {
                const packet = new ACK(buffer);
                this.acks.push(packet);
            } else if (pid & BitFlags.NACK) {
                const packet = new NACK(buffer);
                this.nacks.push(packet);
            } else {
                const datagram = new DataPacket(buffer);
                datagram.decode();
                for (let packet of datagram.packets) {
                    const encapsulated = this.retrivePacket(packet);
                    if (encapsulated !== null) {
                        return this.decodeBatch(encapsulated);
                    }
                }
            }
        }
        return null;
    }

    // Small hack
    public retrivePacket(packet: EncapsulatedPacket): null | EncapsulatedPacket {
        if (packet.splitCount > 0) {
            return this.decodeSplit(packet);
        }
        return packet;
    }

    public decodeBatch(packet: EncapsulatedPacket): DataPacket | null {
        const batched = new TempBatchPacket(packet.buffer);
        batched.decode();
        
        for (const buf of batched.getPackets()) {
            const pid = buf[0];

            // if (!this.packetRegistry.getPackets().has(pid)) {
            //    continue;
            // }

            // This thing is stupid... doesn't work
            // const packet = new (this.packetRegistry.getPackets().get(buf[0]))(buf);
            // console.log(packet.constructor.name);
            
            // so we manually decode it
            // TODO: move to own stream bound (easy)
            switch (pid) {
                case 0x01:
                    break;
                default:
                    continue;
            }
        }
        return null;
    }

    public decodeSplit(packet: EncapsulatedPacket): EncapsulatedPacket | null {
        // Returns null if split packet is not ready (fully reassembled)
        if (!this.splits.has(packet.splitId)) {
            this.splits.set(packet.splitId, new Map([[packet.splitIndex, packet]]));
        } else {
            const value = this.splits.get(packet.splitId)!;
            value.set(packet.splitIndex, packet);
            this.splits.set(packet.splitId, value);
        }

        const localSplits = this.splits.get(packet.splitId)!;
        if (localSplits.size === packet.splitCount) {
            const pk = new EncapsulatedPacket();
            pk.reliability = packet.reliability;
            pk.messageIndex = packet.messageIndex;
            pk.sequenceIndex = packet.sequenceIndex;
            pk.orderIndex = packet.orderIndex;
            pk.orderChannel = packet.orderChannel;
            const stream = new BinaryStream();
            Array.from(localSplits.values()).forEach((packet) => {
                stream.append(packet.buffer);
            });
            this.splits.delete(packet.splitId);
            pk.buffer = stream.getBuffer();
            return pk;
        }
        return null;
    }
}