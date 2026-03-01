import winston from "winston";

import config from "./config";

const log = winston.createLogger({
	level: config.logLevel,
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.colorize(),
		winston.format.printf(({ timestamp, level, message }) => {
			return `${timestamp} [${level}]: ${message}`;
		}),
	),
	transports: [new winston.transports.Console()],
});

export default log;
