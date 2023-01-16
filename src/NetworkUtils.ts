import BinaryStream from '@jsprismarine/jsbinaryutils';
import { Protocol } from './jsprismarine/packages/raknet/src/RakNet.js';
import IConnection from './IConnection.js';
import PacketRegistry from './jsprismarine/packages/prismarine/src/network/PacketRegistry.js';
import ProxyServer from './ProxyServer.js';
import { Server } from './jsprismarine/packages/prismarine/src/Prismarine.js'
import { Protocol as BEProtocol } from './jsprismarine/packages/prismarine/src/Prismarine.js';
import ConnectionReqAcceptedFallback from './ConnectionReqAcceptedFallback.js';

export default class NetworkUtils {
    private proxyServer: ProxyServer;

    public sendSeqNumber: number = 0;

    private acks: Protocol.ACK[] = [];
    private nacks: Protocol.NACK[] = [];

    private splits: Map<number, Map<number, Protocol.Frame>> = new Map();

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

    public readDataPacket(buffer: Buffer): Protocol.Frame[] | null {
        console.log(buffer)
        const pid = buffer[0];
        // Check if is not a offline packet
        if ((pid & Protocol.BitFlags.VALID) !== 0) {
            if (pid & Protocol.BitFlags.ACK) {
                const packet = new Protocol.ACK(buffer);
                this.acks.push(packet);
            } else if (pid & Protocol.BitFlags.NACK) {
                const packet = new Protocol.NACK(buffer);
                this.nacks.push(packet);
            } else {
                const datagram = new Protocol.FrameSet(buffer);
                datagram.decode();
                const frames: Protocol.Frame[] = [];
                for (let packet of datagram.frames) {
                    const encapsulated = this.retrivePacket(packet);
                    if (encapsulated !== null) {
                        frames.push(this.handleFrame(encapsulated));
                    }
                }
                return frames;
            }
        }
        return null;
    }

    private handleFrame(frame: Protocol.Frame): Protocol.Frame {
        const pid = frame.content[0];

        switch (pid) {
            case Protocol.MessageHeaders.CONNECTION_REQUEST_ACCEPTED:
                let accepted = new Protocol.ConnectionRequestAccepted(frame.content);
                let mocked = new Protocol.ConnectionRequestAccepted();
                try {
                    accepted.decode();
                } catch {
                    accepted = new ConnectionReqAcceptedFallback(frame.content);
                    accepted.decode();
                    mocked = new ConnectionReqAcceptedFallback();
                }

                mocked.acceptedTimestamp = accepted.acceptedTimestamp;
                mocked.clientAddress = [...this.proxyServer.clients.values()][0].getAddress();
                mocked.requestTimestamp = accepted.acceptedTimestamp;
                mocked.encode();

                const copyFrame = new Protocol.Frame();
                copyFrame.fragmentId = frame.fragmentId;
                copyFrame.fragmentIndex = frame.fragmentIndex;
                copyFrame.fragmentSize = frame.fragmentSize;
                copyFrame.reliability = frame.reliability;
                copyFrame.sequenceIndex = frame.sequenceIndex;
                copyFrame.reliableIndex = frame.reliability;
                copyFrame.orderChannel = frame.orderChannel;
                copyFrame.orderIndex = frame.orderIndex;
                copyFrame.content = mocked.getBuffer();
                return copyFrame;
            default:
                return frame;
        }

        // TODO: handle 0xfe

        // switch (pid) {
        //    case Protocol.MessageHeaders.CONNECTION_REQUEST:
        //        const connReq = new Protocol.ConnectionRequest(frame.content);
        //        connReq.decode()
        // }
    }

    // Small hack
    public retrivePacket(packet: Protocol.Frame): null | Protocol.Frame {
        if (packet.fragmentSize > 0) {
            return this.decodeSplit(packet);
        }
        return packet;
    }

    public decodeBatch(packet: Protocol.Frame): Protocol.FrameSet | null {
        console.log(packet.content)
        const batched = new BEProtocol.Packets.BatchPacket(packet.content);
        batched.compressed = false;
        batched.decode();
        
        for (const buf of batched.getPackets()) {
            const pid = buf[0];
            console.log(pid)

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

    public decodeSplit(packet: Protocol.Frame): Protocol.Frame | null {
        // Returns null if split packet is not ready (fully reassembled)
        if (!this.splits.has(packet.fragmentId)) {
            this.splits.set(packet.fragmentId, new Map([[packet.fragmentIndex, packet]]));
        } else {
            const value = this.splits.get(packet.fragmentId)!;
            value.set(packet.fragmentIndex, packet);
            this.splits.set(packet.fragmentId, value);
        }

        const localSplits = this.splits.get(packet.fragmentId)!;
        if (localSplits.size === packet.fragmentSize) {
            const pk = new Protocol.Frame();
            pk.reliability = packet.reliability;
            pk.reliableIndex = packet.reliableIndex;
            pk.sequenceIndex = packet.sequenceIndex;
            pk.orderIndex = packet.orderIndex;
            pk.orderChannel = packet.orderChannel;
            const stream = new BinaryStream();
            Array.from(localSplits.values()).forEach((packet) => {
                stream.write(packet.content);
            });
            this.splits.delete(packet.fragmentId);
            pk.content = stream.getBuffer();
            return pk;
        }
        return null;
    }
}