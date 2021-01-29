import LevelChunkPacket from '@jsprismarine/prismarine/dist/src/network/packet/LevelChunkPacket';

export default class TempLevelChunkPacket extends LevelChunkPacket {
    
    public decodePayload() {
        this.chunkX = this.readVarInt();
        this.chunkZ = this.readVarInt();
        this.subChunkCount = this.readUnsignedVarInt();
        this.readBool();  // Don't care
        const len = this.readUnsignedVarInt();
        this.read(len);
    }
    
}