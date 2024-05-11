'use client';

export const Store = (function() {
	const store: { [key: string]: any } = {};

	return {
		set: (key: string, value: any) => {
			store[key] = value
		},
		get: (key: string, defolt?: any) => {
			const val = store[key];
			if (!val) return defolt
			return val
		}
	}
})()
