'use client';

export const StoreKey = {
	files: 'files',
	uploads: 'uploads',
}

export const Store = (function() {
	const store: { [key: string]: any } = {};
	const eventStore: { [key: string]: Function[] } = {};

	let methods = {
		set: (key: string, value: any) => {
			store[key] = value

			return methods;
		},
		get: (key: string, defolt?: any) => {
			const val = store[key];

			if (!val) return defolt
			return val
		},
		on: (event: string, fn: Function) => {
			let handlers = eventStore[event] || [];

			const i = handlers.findIndex(handler => handler.name == fn.name)
			if (i >= 0) return methods;


			eventStore[event] = handlers.concat([fn])
			return methods;
		},
		emit: (event: string, args: any) => {
			let handlers = eventStore[event]
			if (!handlers) {
				return methods
			}

			for (let handler of handlers) {
				handler(args)
			}

			return methods
		},
		off: (event: string, fn: Function) => {
			let handlers = eventStore[event]

			if (!handlers) return methods;

			const i = handlers.findIndex(handler => handler.name == fn.name)
			if (i < 0) return methods;

			eventStore[event] = [...handlers.slice(0, i), ...handlers.slice(i + 1)]
			return methods
		}
	}

	return methods;
})()

