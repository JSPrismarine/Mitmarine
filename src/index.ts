import * as path from "path";

import ConfigBuilder from '@jsprismarine/prismarine/dist/config/ConfigBuilder';
import LoggerBuilder from '@jsprismarine/prismarine/dist/utils/Logger';
import ProxyServer from './ProxyServer';

const config = new ConfigBuilder(path.join(process.cwd(), 'proxy-config.yaml'));
const logger = new LoggerBuilder();
new ProxyServer(config, logger);

