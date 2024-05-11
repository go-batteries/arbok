"use client";

import { filetypeinfo } from 'magic-bytes.js/dist';

import { Store } from '@/commons/store';

import { getCookie } from 'cookies-next';

const crypto = () => window.crypto;

export function SetupDraggable(dropArea: HTMLElement) {
	['dragenter', 'dragover', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, preventDefaults, false);
	});

	['dragenter', 'dragover'].forEach(eventName => {
		dropArea.addEventListener(eventName, highlight(dropArea), false);
	});

	['dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, unhighlight(dropArea), false);
	});


	dropArea.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e: any) {
	e.preventDefault();
	e.stopPropagation();
}

function highlight(dropArea: HTMLElement) {
	return () => {
		dropArea.classList.add('highlight');
	}
}

function unhighlight(dropArea: HTMLElement) {
	return () => dropArea.classList.remove('highlight');
}

function handleDrop(e: any) {
	const dt = e.dataTransfer;
	const files = dt.files;

	Store.set('uploads', files);
}

function handleDropWrapper(fileRef: HTMLElement) {
	return function handleDrop(e: any) {
		const dt = e.dataTransfer;
		const files = dt.files;

		Store.set('uploads', files);
	}
}

const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB

type Ffile = {
	buff: Blob,
	id: number
	name: string,
	t: string,
	size: number,
	digest: string,
}

const DOMAIN = () => "http://localhost:9191";


export async function fetchJSON(url: string, opts: any) {
	let headers = {
		...opts.headers,
		'Content-Type': 'application/json',

	};
	opts.headers = headers;
	return await fetch(url, {
		...opts,
	}).then(resp => resp.json());
}

function checkAccessToken() {
	console.log(document.cookie); // should have access token for authenticated users;
}

const FileUtils = {
	async digestBlob(file: File | Blob, withType?: boolean) {
		const buff = await file.arrayBuffer();

		const hashAsBuff = await crypto().subtle.digest("SHA-256", buff);

		const uint8ViewOfHash = new Uint8Array(hashAsBuff);
		const hashDigestHex = Array.from(uint8ViewOfHash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		//TODO: check this bullshit
		let _fileTypes = filetypeinfo(uint8ViewOfHash)
		console.log("filetypes====", _fileTypes, withType);

		let fileType = "blob"

		if (_fileTypes.length) {
			fileType = _fileTypes[0].mime || _fileTypes[0].typename
		}

		return {
			digest: hashDigestHex,
			fileType,
		};
	},


	getAccessToken() {
		return "trial_access_token"

		// const cookystore = cookies();
		// return cookystore.get('access_token');
	},

	getStreamToken() {
		return localStorage.getItem('stream_token');
	},
}


var PARALLEL_STREAMS = 3;

const buildAuthTokenHeader = (): { [key: string]: string } => {
	return {
		'X-Access-Token': `Bearer ${FileUtils.getAccessToken()}`
	}
}

const buildStreamToken = (): { [key: string]: string } => {
	return {
		'X-Stream-Token': `Bearer ${FileUtils.getStreamToken()}`
	}
}

type JSONRequest = {
	method: string,
	headers: { [key: string]: string },
	signal?: AbortSignal,
}

export class FileService {
	calculateChunks(fileSize: number) {
		return Math.floor((fileSize + CHUNK_SIZE - 1) / CHUNK_SIZE)
	}

	async fetchFiles(abortSignal?: AbortSignal) {
		let data: JSONRequest = {
			method: 'GET',
			headers: {
				...buildAuthTokenHeader(),
			},
		}

		if (abortSignal) {
			data = { ...data, signal: abortSignal }
		}

		return fetchJSON(`${DOMAIN()}/my/files`, data)
	}

	async uploadMetadata(file: File) {
		const fileInfo = await FileUtils.digestBlob(file, true);

		let data = Store.get('files', [])
		let prevFileRevisionFound = data.find((info: any) => info.fileName == file.name)

		console.log(prevFileRevisionFound)

		if (prevFileRevisionFound) {
			// Check if the hash changed
			if (prevFileRevisionFound.fileHash == fileInfo.digest)
				return Promise.resolve(file)

			return fetchJSON(`${DOMAIN()}/my/files/${prevFileRevisionFound.fileID}`, {
				method: 'PATCH',
				headers: {
					...buildAuthTokenHeader(),
				},
				body: JSON.stringify({
					fileID: prevFileRevisionFound.fileID,
					fileSize: file.size,
					chunks: this.calculateChunks(file.size),
					digest: fileInfo.digest,

				}).then(resp => resp.json()).then(data => {
					console.log(data)
					localStorage.setItem("stream_token", data.data?.streamToken)
					//TODO: update the info in Store
					return data
				})
			})
		}

		const body = {
			fileName: file.name,
			fileSize: file.size,
			fileType: fileInfo.fileType,
			digest: fileInfo.digest,
			chunks: this.calculateChunks(file.size),
		};


		// checkAccessToken()

		return fetchJSON(`${DOMAIN()}/my/files`, {
			method: 'POST',
			headers: {
				...buildAuthTokenHeader(),
			},
			body: JSON.stringify(body),
		}).then(data => {
			console.log(data);
			if (data.success) {
				alert("success file metadata")

				// Here we are setting the stream token that is comming in respons
				localStorage.setItem("stream_token", data.data?.streamToken)
				return data.data
			}

			console.error("metadata upload failed", data.error.code);
			throw new Error("failed")
		}).catch(err => {
			console.error(err);
			alert("retry")
			throw err
		})
	}

	async uploadFile(file: File, fileID: string, fileType: string) {
		const fileInfo = await FileUtils.digestBlob(file, true);

		let data = Store.get('files', [])
		let prevFileRevisionFound = data.find((info: any) => info.fileName == file.name)

		// return Promise.resolve(true)

		let chunks = await this.chunkFile(file);

		// Figure out the chunks that has changed
		if (prevFileRevisionFound) {
			console.log(prevFileRevisionFound.chunks)

			// make sure to sort the chunks by chunkID
			const prevChunks = prevFileRevisionFound.chunks.sort((prev, next) => prev.chunkID - next.chunkID)

			console.log(prevChunks);
			// Need to check this once
			chunks.filter(chunk => prevChunks.find(prevChunk => prevChunk.digest == chunk.digest))
		}

		const chunkSize = chunks.length;
		let groups = <Array<Array<any>>>[];

		for (let i = 0; i < chunkSize; i += PARALLEL_STREAMS) {
			groups.push(chunks.slice(i, Math.min(i + PARALLEL_STREAMS, chunkSize)))
		}

		const chunkResult = []
		let nextId = 0

		// use only n_PARALLEL STREAMS
		for (let chunk of groups) {
			let res = await Promise.allSettled(chunk.map(async (ffile: Ffile) => {
				const body = new FormData();

				nextId += 1
				if (nextId == chunks.length)
					nextId = -1

				body.append("data", ffile.buff);
				body.append("chunkSize", `${ffile.size}`);
				body.append("id", `${ffile.id}`);
				body.append("nextChunkID", `${nextId}`)
				body.append("chunkDigest", ffile.digest);

				await fetch(`${DOMAIN()}/my/files/${fileID}/chunks`, {
					method: 'PATCH',
					headers: {
						...buildAuthTokenHeader(),
						...buildStreamToken(),
					},
					body: body,
				}).then(response => response.json()).catch(e => {
					console.error(`Failed uploading ${ffile.name}, ${ffile.id}`)
					console.error(e);

					throw Error('Chunk Upload Failed');
				})

			}))

			chunkResult.push(res);
		}

		return Promise.resolve(chunkResult)

	}

	async chunkFile(file: File): Promise<Ffile[]> {
		let chunks = [];
		let start = 0;

		let numChunks = this.calculateChunks(file.size)

		while (start < numChunks) {
			const buff = file.slice(start, start + CHUNK_SIZE);
			console.log("waiting for digestion")

			const digest = await FileUtils.digestBlob(buff);

			chunks.push(
				{
					buff: buff,
					id: start,
					name: file.name,
					t: file.type,
					size: file.size,
					digest: digest.digest,
				}
			);
			start += 1;
		}

		return chunks;
	}
}

