export class Cookie {
	
	name = null;
	value = null;
	parameters = {};

	constructor(cookie) {
		const items = cookie.split(/;\s?/);
		
		const nameValue = items[0].split('=');
		this.name = nameValue[0];
		this.value = nameValue[1];

		let i = 1;
		while (i < items.length){
			const param = items[i].split('=');
			this.parameters[param[0]] = param[1] || true;
			i++;
		}
	}
	
}

export class CookiesBox {
	
	box = [];

	constructor() {

	}

	add(name, value) {
		this.box.push({
			name,
			value,
			parameters: {} 
		});
	}

	set(cookiesHeader) {
		const setCookie = (header) => {
			const cookie = new Cookie(header);
			const index = this.box.findIndex(c => c.name === cookie.name);
			if (index < 0) {
				this.box.push(cookie);
			} else {
				this.box[index] = cookie;
			}
		};
		if (Array.isArray(cookiesHeader)) {
			cookiesHeader.forEach(h => setCookie(h));
		} else {
			setCookie(cookiesHeader);
		}
	}

	asHeaderValue() {
		return this.box.map(c => `${c.name}=${c.value}`).join('; ');
	}
}
