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

		// console.log(fileType, "fileType")
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

	async fetchFileChunks(fileID: string) {
		let req: JSONRequest = {
			method: 'GET',
			headers: {
				...buildAuthTokenHeader(),
				...buildStreamToken(),
			}
		}

		try {
			let response = await fetch(`${DOMAIN()}/my/files/${fileID}/download`, req)
			if (response.status >= 400) {
				throw new Error("failed download")
			}

			let blob = await response.blob()
			const contentDisposition = response.headers.get('Content-Disposition');
			let fileName = 'downloaded-file';

			if (contentDisposition) {
				const match = contentDisposition.match(/filename="(.+)"/);
				if (match?.length === 2) fileName = match[1];
			}

			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.style.display = 'none';
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);

		} catch (e) {
			console.log(e)
		}

	}

	async markComplete(fileID: string) {
		let req: JSONRequest = {
			method: 'PUT',
			headers: {
				...buildAuthTokenHeader(),
				...buildStreamToken(),
			}
		}

		return fetchJSON(`${DOMAIN()}/my/files/${fileID}/eof`, req)
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

	async updateMetadata(prevRevision: any, file: File, fileInfo: { digest: string, fileType: string }) {
		const body = {
			fileID: prevRevision.fileID,
			fileSize: file.size,
			fileName: file.name,
			chunks: this.calculateChunks(file.size),
			digest: fileInfo.digest,
		}

		// console.log("update body", body)

		return fetchJSON(`${DOMAIN()}/my/files/${body.fileID}`, {
			method: 'PATCH',
			headers: {
				...buildAuthTokenHeader(),
			},
			body: JSON.stringify(body)

		}).then(data => {
			let result = data.body;

			if (data.success) {
				localStorage.setItem("stream_token", result?.data?.streamToken)
				return { data: result?.data, ...body }
			}

			throw new Error("failed")
		}).catch(e => {
			console.log("metadata update failed")
			console.log(e)
			throw e
		})
	}

	async uploadMetadata(file: File) {
		const fileInfo = await FileUtils.digestBlob(file, true);

		let data = Store.get(StoreKey.files, [])

		// TODO: add fileType as filterCriteria
		let prevFileRevision = data.find((info: any) => info.fileName == file.name)

		if (prevFileRevision) {
			if (prevFileRevision.fileHash == fileInfo.digest)
				return Promise.reject(new Error("no_change"))

			//UPDATE

			let chunks = await this.chunkFile(file);
			let prevChunks = prevFileRevision.chunks;

			console.log("chunk hashes",
				"present", chunks.map(c => c.digest),
				"previous", Object.values(prevChunks).map((c: any) => c.chunkHash))

			chunks = chunks.filter(chunk => chunk.digest != prevChunks[`${chunk.id}`]?.chunkHash)

			console.log("chunks to upload ", chunks.length)
			console.log("chunk diff", chunks.map(c => c.digest))

			return this.updateMetadata(
				prevFileRevision,
				file,
				fileInfo,
			)
		}

		// CREATE
		const body = {
			fileName: file.name,
			fileSize: file.size,
			fileType: fileInfo.fileType,
			digest: fileInfo.digest,
			chunks: this.calculateChunks(file.size),
		};


		return fetchJSON(`${DOMAIN()}/my/files`, {
			method: 'POST',
			headers: {
				...buildAuthTokenHeader(),
			},
			body: JSON.stringify(body),
		}).then(data => {
			let result = data.body?.data;

			if (data.success) {
				localStorage.setItem("stream_token", result?.streamToken)
				return { data: result, ...body }
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
		let data = Store.get(StoreKey.files, [])
		let prevFileRevision = data.find((info: any) => info.fileName == file.name)

		let chunks = await this.chunkFile(file);

		// debugger
		// return Promise.reject(true)

		if (Object.values(prevFileRevision?.chunks || {}).length == chunks.length) {
			const prevChunks = prevFileRevision.chunks
			chunks = chunks.filter(chunk => chunk.digest != prevChunks[`${chunk.id}`]?.chunkHash)
		}

		const chunkSize = chunks.length;
		console.log("chunks to update ", chunkSize)

		let groups = <Array<Array<any>>>[];

		for (let i = 0; i < chunkSize; i += PARALLEL_STREAMS) {
			groups.push(chunks.slice(i, Math.min(i + PARALLEL_STREAMS, chunkSize)))
		}

		Store.set(StoreKey.files, [])
		Store.emit(StageFileEvent, [])

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

		while (start < file.size) {
			const end = Math.min(start + CHUNK_SIZE, file.size);
			const buff = file.slice(start, end);

			// console.log(start, end)

			const digest = await FileUtils.digestBlob(buff);


			index += 1
			const nextChunkID = index === numChunks ? -1 : index;

			chunks.push(
				{
					buff: buff,
					id: index - 1,
					name: file.name,
					t: file.type,
					size: file.size,
					digest: digest.digest,
					nextChunkID: nextChunkID,
				}
			);
			start = end;
		}

		return chunks;
	}
}


export const cn = function(...args: any): string {
	return args.join(" ")
}
