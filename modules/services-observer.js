import { HttpUserAgent } from './agent.js';
import URL from 'url';
import querystring from 'querystring'
import log4js from 'log4js';
import EventEmitter from 'events'

const log = log4js.getLogger();

export class ServicesObserver extends EventEmitter {

	authorizedAgent = null;
	intervalHandler = null;
	pNumber = null;
	siteId = null;
	site = null;
	previousServices = null;

	constructor(pNumber, password, site, pollingPeriod) {
		super();
		this.pNumber = pNumber;
		this.site = site;
		this.init(pNumber, password, pollingPeriod);
	}

	async init(pNumber, password, pollingPeriod) {
		try {
			this.authorizedAgent = await this.authorize(pNumber, password);
			this.check();
			this.intervalHandler = setInterval(() => this.check(), pollingPeriod);
		} catch (err) {
			this.emit('error', this.pNumber, err);
		}
	}

	destroy() {
		clearInterval(this.intervalHandler);
	}


	extractSiteId(content) {
		const m = content.match(/window.__PRELOADED_STATE__\s* =\s*({.*})/);
		if (m != null) {
			const data = JSON.parse(m[1]);
			return data.app.siteId;
		}
		log.fatal('No siteId meta found');
		return null;
	}

	extractCsrf(content) {
		// <meta content="108c2e5a-eb6b-4be0-814d-c6bdf559a0be" name="_csrf"/>
		const meta = content.match(/(<meta[^<>]*name="_csrf"[^<>]*\/>)/);
		if (meta != null) {		
			const value = meta[1].match(/content="([^"]*)"/);
			return value[1];
		}
		log.error('No _csrf meta found');
		return null;
	}
	
	extractError(content) {
		// <div class="error-text">Неверный логин</div>
		const match = content.match(/<div class="error-text">([^<>].*)<\/div>/);
		if (match) {
			return main[0];
		}
		log.error('No error text found');
		return null;
	}
	
	async authorize(pNumber, password) {
		const agent = new HttpUserAgent(this.site);
		const resp = await agent.navigate('/');
		this.siteId = this.extractSiteId(resp.content);
		if (this.siteId == null) {
			throw new Error('Unable continue without siteId');
		}
	
		const loginAgent = new HttpUserAgent('login.tele2.ru', this.site);	
		const formResult = await loginAgent.navigate('/ssotele2/wap/auth', {
			'serviceId': 681,
			'returnUrl': `https://${this.site}/api/auth/sso/successLogin?returnUrl=%2F`,
		});
		const csrf = this.extractCsrf(formResult.content);
		const res = await loginAgent.postForm('/ssotele2/wap/auth/submitLoginAndPassword', {
			'_csrf': csrf,
			'authBy': 'BY_PASS',
			'rememberMe': true,
			pNumber,
			password,
		});
		if (loginAgent.referer.indexOf('successLogin') > -1) {
			log.debug('Return url:', loginAgent.referer);
			log.info('Logged in successfully');
			const url = URL.parse(loginAgent.referer);
			const query = querystring.parse(url.query);
			agent.cookies.add('t2-auth', query.key);
			await agent.navigate('/api/route/redirect', { path: query.returnUrl, pageParams: 'authorized=true' });
			return agent;
		}
		log.error('Login failed:', this.extractError(res.content));
		return null;
	}
	
	async check() {
		try {
			await this.checkServices();
			await this.checkSubscriptions();
		} catch (err) {
			this.emit('error', this.pNumber, err);
		}
	}

	async checkServices() {
		log.info('Checking services');
		const services = await this.authorizedAgent.xhrGet(`/api/subscribers/${this.pNumber}/${this.siteId}/services`, { status: 'connected' });
		const parsed = JSON.parse(services.content);
		if (parsed.meta.status === 'ERROR') {
			log.debug('content:', services.content);
			throw new Error(parsed.meta.message);
		}		
		const currentServices = parsed.data;
		if (this.previousServices == null) {
			currentServices.forEach(s => {
				log.info(`service: ${s.name}, abonentFee:`, s.abonentFee);
			});
		} else {
			const newServices = currentServices.filter(s => this.previousServices.every(ps => ps.billingId !== s.billingId));
			if (newServices.length === 0) {
				log.info('No new services');
			} else {
				log.warn('New serices found:');
				newServices.forEach(s => {
					log.warn(`service: ${s.name}, abonentFee:`, s.abonentFee);
				});
			}
		}
		this.previousServices = currentServices;
	}

	async checkSubscriptions() {
		// https://chelyabinsk.tele2.ru/api/subscribers/79043008412/subscription
		log.info('Checking subscriptions');
		const resp = await this.authorizedAgent.xhrGet(`/api/subscribers/${this.pNumber}/subscription`);
		const parsed = JSON.parse(resp.content);
		if (parsed.meta.status === 'ERROR') {
			log.debug('content:', resp.content);
			throw new Error(parsed.meta.message);
		}		
		const subscriptions = parsed.data;
		subscriptions.forEach(s => {
			log.warn(`subscription: ${s.name}, cost: ${s.cost}/${s.period}`);
			this.removeSubscription(s.name, s.prov_id, s.serv_id);
		});
		if (subscriptions.length === 0) {
			log.info('No subscriptions');
		}
		
	}

	async removeSubscription(name, providerId, serviceId) {		
		log.info(`Removing subscription: ${name}`);
		try {
			const resp = await this.authorizedAgent.xhrDelete(
				`/api/subscribers/${this.pNumber}/subscription`,
				{ prov_id: providerId, serv_id: serviceId }
			);
			const parsed = JSON.parse(resp.content);
			if (parsed.meta.status === 'ERROR') {
				log.warn('Subscription remove failed');
				this.emit('error', this.pNumber, new Error(parsed.meta.message));
			}
		} catch(e) {
			log.warn('Unable remove subscription');
			this.emit('error', this.pNumber, e);
		}
	}

}
