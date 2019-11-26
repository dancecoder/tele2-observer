import log4js from 'log4js';
import { ServicesObserver } from "./services-observer.js";


const DEFAULT_FAIL_TRESHOLD = 60 * 60 * 1000;
const DEFAULT_FAIL_MAX_COUNT = 3;
const DEFAULT_OBSERVER_RESTART_TIMEOUT = 60 * 1000;
const DEFAULT_POLLING_PERIOD = 5 * 60 * 1000;

const log = log4js.getLogger();

export class Application {

	observers = new Map();
	fails = new Map();
	
	config = {
		failTreshold: DEFAULT_FAIL_TRESHOLD,
		failMaxCount: DEFAULT_FAIL_MAX_COUNT,
		observerRestartTimeout: DEFAULT_OBSERVER_RESTART_TIMEOUT,
		pollingPeriod: DEFAULT_POLLING_PERIOD,
		site: null,
		accounts: [],
	};

	constructor(config) {
		this.config = {
			...this.config,
			...config,
		};
	}

	run() {
		this.config.accounts.forEach(this.startObserver.bind(this));
		this.config.accounts.forEach(acc => this.fails.set(acc.pNumber, { timestamp: 0, count: 0 }));
	}

	destroy() {
		this.observers.forEach(o => o.destroy());
	}
		
	startObserver(acc) {
		log.info('Starting observer for', acc.pNumber);
		const observer = new ServicesObserver(
			acc.pNumber, 
			acc.password, 	
			this.config.site, 
			this.config.pollingPeriod
		);
		observer.on('error', this.observerErrorHandler.bind(this));
		this.observers.set(acc.pNumber, observer);	
	}


	observerErrorHandler(pNumber, err) {	
		log.error(`Observer for ${pNumber} failed:`, err.message);
		let fail = this.fails.get(pNumber);
		fail.count = (Date.now() - fail.timestamp > this.config.failTreshold) ? 1 : fail.count + 1;
		fail.timestamp = Date.now();
		this.observers.get(pNumber).destroy();
		if (fail.count < this.config.failMaxCount) {
			const account = this.config.accounts.find(acc => acc.pNumber === pNumber);
			const timeout = this.config.observerRestartTimeout * fail.count;
			setTimeout(() => this.startObserver(account), timeout);
		} else {
			log.error(`Unable restart observer for ${pNumber}: max fails limits reached`);
			this.observers.delete(pNumber);
		}
	}

}
