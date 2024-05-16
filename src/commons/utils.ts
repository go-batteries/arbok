"use client";

import { filetypeinfo } from 'magic-bytes.js/dist';
import { Store, StoreKey } from '@/commons/store';
import { StageFileEvent } from './events';

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

	Store.emit(StageFileEvent, files)
	Store.set(StoreKey.uploads, files)
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
	nextChunkID: number
}

const DOMAIN = () => "http://localhost:9191";


type ResponseDetails = {
	status: number,
	success: boolean,
	body?: any,
}

export async function fetchJSON(url: string, opts: any) {
	let headers = {
		...opts.headers,
		'Content-Type': 'application/json',
	};
	opts.headers = headers;

	let respDetails: ResponseDetails;

	return await fetch(url, {
		...opts,
	}).then(resp => {
		respDetails = {
			status: resp.status,
			success: resp.status < 400,
		}
		if (Number(resp.headers.get("content-length")) > 0) {
			return resp.json()
		}

		return resp.text()
	}).then(result => {
		respDetails.body = result
		return respDetails;
	});
}

const FileUtils = {
	async digestBlob(file: File | Blob, withType?: boolean) {
		const buff = await file.arrayBuffer();

		const hashAsBuff = await crypto().subtle.digest("SHA-256", buff);

		const uint8ViewOfHash = new Uint8Array(hashAsBuff);
		const hashDigestHex = Array.from(uint8ViewOfHash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		// console.log(buff, new Uint8Array(buff))
		let _fileTypes = filetypeinfo(new Uint8Array(buff))

		let fileType = "blob"

		if (_fileTypes.length) {
			fileType = _fileTypes[0].mime || _fileTypes[0].typename
		}

		console.log(fileType, "fileType")
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

		let data = Store.get(StoreKey.files, [])

		debugger
		// TODO: add fileType as filterCriteria
		let prevFileRevisionFound = data.find((info: any) => info.fileName == file.name)

		if (prevFileRevisionFound) {
			if (prevFileRevisionFound.fileHash == fileInfo.digest)
				return Promise.reject(new Error("no_change"))

			const body = {
				fileID: prevFileRevisionFound.fileID,
				fileSize: file.size,
				fileName: file.name,
				chunks: this.calculateChunks(file.size),
				digest: fileInfo.digest,

			}
			return fetchJSON(`${DOMAIN()}/my/files/${prevFileRevisionFound.fileID}`, {
				method: 'PATCH',
				headers: {
					...buildAuthTokenHeader(),
				},
				body: JSON.stringify(body)
			}).then(data => {
				let result = data.body;

				if (data.success) {
					if (result?.streamToken)
						localStorage.setItem("stream_token", result?.streamToken)
				}
				return { data: result, ...body }
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
			let result = data.body;

			if (data.success) {
				// Here we are setting the stream token
				// that is comming in respons
				localStorage.setItem("stream_token", result?.streamToken)
				return { data: result?.data, ...body }
			}

			console.error("metadata upload failed", result?.error.code);
			throw new Error("failed")
		}).catch(err => {
			console.error(err);
			alert("retry")
			throw err
		})
	}

	async uploadFile(file: File, fileID: string, fileHash: string, fileType: string) {
		// const fileInfo = await FileUtils.digestBlob(file, true);

		let data = Store.get(StoreKey.files, [])
		let prevFileRevisionFound = data.find((info: any) => info.fileName == file.name)

		let chunks = await this.chunkFile(file);

		console.log(prevFileRevisionFound)
		console.log(prevFileRevisionFound && prevFileRevisionFound.chunks.length == chunks.length)

		debugger

		return Promise.reject(true)


		// TODO: Here we need to make a call
		// The thing is
		// When a file is getting replaced
		// It can have 3 conditions
		//
		// 1. Some part has been deleted and modified, keeping chunk size same
		//    But different content hash
		// 2. A good chunk of the file has been modified, leading to reaggarngement
		//	  of chunks. So we may end up with more or less than present chunks.
		//
		// So, Addition of chunks is less of an issue than deletion.
		// Cause during deletion, we are now left with empty chunks in database records
		// which needs to be cleaned up
		// Considering this, when the number of chunks changes
		//
		// We are going to do a full update, and not do the comparison with prevChunks
		// On the backend we need to handle the deletion case while listing file chunks in
		// /files API

		const chunkSize = chunks.length;

		if (prevFileRevisionFound &&
			prevFileRevisionFound.chunks &&
			prevFileRevisionFound.chunks[prevFileRevisionFound.version].length == chunkSize) {



			// make sure to sort the chunks by chunkID
			// const prevChunks = prevFileRevisionFound.chunks.sort((prev, next) => prev.chunkID - next.chunkID)
			const prevChunks = prevFileRevisionFound.chunks[prevFileRevisionFound.version]
			console.log(prevChunks)

			// Need to check this once
			chunks = chunks.filter(chunk => chunk.digest != prevChunks[chunk.id] ? prevChunks[chunk.id].chunkHash : undefined)
			console.log(chunks)

		}


		let groups = <Array<Array<any>>>[];

		for (let i = 0; i < chunkSize; i += PARALLEL_STREAMS) {
			groups.push(chunks.slice(i, Math.min(i + PARALLEL_STREAMS, chunkSize)))
		}

		Store.set(StoreKey.files, [])

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
				body.append("fileDigest", fileHash);

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
		let index = 0

		while (start < numChunks) {
			const buff = file.slice(start, start + CHUNK_SIZE);
			console.log("waiting for digestion")

			const digest = await FileUtils.digestBlob(buff);

			index += 1
			if (index == numChunks) index = -1

			chunks.push(
				{
					buff: buff,
					id: start,
					name: file.name,
					t: file.type,
					size: file.size,
					digest: digest.digest,
					nextChunkID: index,
				}
			);
			start += 1;
		}

		return chunks;
	}
}


export const cn = function(...args: any): string {
	return args.join(" ")
}
