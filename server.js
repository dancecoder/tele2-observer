import log4js from 'log4js';
import fs from 'fs';
import process from 'process';
import { Application } from './modules/application.js';

const WATCH_DOG_INTERVAL = 60000;

const ExitCode = {
	'noActiveObservers': 1,
};

// default log levels
// ALL < TRACE < DEBUG < INFO < WARN < ERROR < FATAL < MARK
log4js.configure('./config.log4js.json');

const log = log4js.getLogger();
log.info('Dæmon started');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const app = new Application(config);
app.run();

function stop(code) {
	log.info('Exiting');
	app.destroy();
	log4js.shutdown(() => process.exit(code));
}

process.on('SIGINT', () => {
	log.info('SIGINT');
	stop(0);
});
process.on('SIGTERM', () => {
	log.info('SIGTERM');
	stop(0);
});
process.on('SIGHUP', () => {
	log.info('SIGHUP');
	stop(0);
});

function checkObservers() {
	if (app.observers.size === 0) {
		log.fatal('No one active observer');
		stop(ExitCode.noActiveObservers);
	}
}

setInterval(checkObservers, WATCH_DOG_INTERVAL);
