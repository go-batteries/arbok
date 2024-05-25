"use client";

import { filetypeinfo } from 'magic-bytes.js/dist';
import { Store, StoreKey } from '@/commons/store';
import { FileUploadCompleteEvent, StageFileEvent } from './events';
import { fail } from 'assert';

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

	Store.set(StoreKey.uploads, files)
	Store.emit(StageFileEvent, files)
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

export type UploadedFile = {
	fileID: string,
	fileName: string,
	fileHash: string,
	fileSize: number,
	fileType: string,
	nChunks: number,
	userID: string,
	chunks: Map<number, ChunkUploadResponse>,
	currentFlag: boolean,
	syncing: boolean,
}

export type MetadataResponse = {
	streamToken: string,
	prevID: string | null,
	fileID: string,
	fileHash: string,
	fileType: string,
	uploadStatus: string,
	createdAt: string,
	expiresAt: number,
}

export type ChunkUploadResponse = {
	chunkID: number,
	nextChunkID: number,
	chunkBlobUrl: string,
	chunkHash: string,
	createdAt: string,
	updatedAt: string,
}

type MetadataRequestResponse = {
	data?: MetadataResponse,
	body: {
		fileID: string,
		fileSize: number,
		fileType: string,
		fileName: string,
		chunks: number,
		digest: string,
	}
}

export const DOMAIN = () => "http://localhost:9191";

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
		if (resp.headers.get("content-type") == "application/json") {
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

		let fileType = "application/octet-stream"

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

export const buildDownloadURL = (fileID: string) => {
	const dummyToken = `${FileUtils.getStreamToken()}:${FileUtils.getAccessToken()}`
	return `${DOMAIN()}/my/files/${fileID}/download?X-Sig-Token=${dummyToken}`
}

export class FileService {
	calculateChunks(fileSize: number) {
		return Math.floor((fileSize + CHUNK_SIZE - 1) / CHUNK_SIZE)
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

	//Create a type here
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
				return { data: result?.data, body }
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


			if (Object.values(prevFileRevision?.chunks || {}).length == chunks.length) {
				const prevChunks = prevFileRevision.chunks

				chunks = chunks.filter(chunk => {
					const prevChunk = prevChunks[`${chunk.id}`];

					return (
						prevChunk &&
						(chunk.digest != prevChunk.chunkHash ||
							chunk.nextChunkID !== prevChunk.nextChunkID
						)
					)
				})
			}

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
				return { data: result, body }
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

		// Check if previousRevision is present and 
		// filter the ones whose hash digest changed
		if (Object.values(prevFileRevision?.chunks || {}).length == chunks.length) {
			const prevChunks = prevFileRevision.chunks

			chunks = chunks.filter(chunk => {
				const prevChunk = prevChunks[`${chunk.id}`];

				return (
					prevChunk &&
					(chunk.digest != prevChunk.chunkHash ||
						chunk.nextChunkID !== prevChunk.nextChunkID
					)
				)
			})
		}

		const chunkSize = chunks.length;
		console.log("chunks to update ", chunkSize)

		let groups = <Array<Array<any>>>[];

		for (let i = 0; i < chunkSize; i += PARALLEL_STREAMS) {
			groups.push(chunks.slice(i, Math.min(i + PARALLEL_STREAMS, chunkSize)))
		}

		// Store.set(StoreKey.files, [])
		// Store.emit(StageFileEvent, [])

		let chunkResult = []
		let fails = [];

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
				body.append("fileName", file.name);

				return await fetch(`${DOMAIN()}/my/files/${fileID}/chunks`, {
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


			for (let value of res.values()) {
				if (value.status == "rejected") {
					fails.push(value.reason)
				} else if (value.value?.success) {
					chunkResult = [...chunkResult, value.value?.data];
				} else {
					fails.push(value.value)
				}
			}
		}

		if (fails.length > 0) {
			return Promise.reject(fails)
		}

		return Promise.resolve(chunkResult)
	}

	resetStage() {
		Store.set(StoreKey.uploads, [])
		Store.emit(StageFileEvent, [])
	}

	// Initial commit to handle file upload and show in processing status
	// On frontend
	// On backend we can send the listings with status='uploading' &  current_flag = 0 created_at desc
	// Right now
	//
	//
	// This takes the response of file metadata create and the file chunk uploads.
	// Fetches the files from app memory store
	// And then goes on about rest of it
	//
	// On refresh though, the data is gone. That's why the need for a backend api
	// The idea is, to 
	//
	// send sse events from the worker via the server, to notify the file chunk upload completed
	// Update the app memory store
	updateStoreView(metadataResponse: MetadataRequestResponse, chunksResponse: Map<number, ChunkUploadResponse>) {
		if (!metadataResponse.data) {
			return
		}

		// Find the exisiting file if present
		// Create the new mock file and update the app store
		// If previous version of file is present, just update the
		// metadata info for now
		// Since we are not doing chunked download on the client side
		const files: UploadedFile[] = Store.get(StoreKey.files, [])
		const prevFileIdx = files.findIndex(f => f.fileHash == metadataResponse.data?.fileHash)

		console.log("update", files)

		const thisFile: UploadedFile = {
			fileID: metadataResponse.data.fileID,
			fileName: metadataResponse.body.fileName,
			fileHash: metadataResponse.data?.fileHash,
			fileSize: metadataResponse.body.fileSize,
			fileType: metadataResponse.body.fileType,
			nChunks: metadataResponse.body.chunks,
			userID: '',
			currentFlag: false,
			syncing: true,
			chunks: chunksResponse,
		}

		if (prevFileIdx == -1) {
			//Its a new file
			if (!metadataResponse.data) {
				return //safety check
			}
			console.log(thisFile, "thiFile", [thisFile, ...files])

			Store.set(StoreKey.files, [thisFile, ...files])
			Store.emit(FileUploadCompleteEvent, [thisFile, ...files])

			return
		}

		//Update exisisting file
		console.log("figure out how to convet exsisting file updates")

		const prevFile = {
			...files[prevFileIdx],
			fileID: metadataResponse.data.fileID,
			fileHash: metadataResponse.data.fileHash,
			fileSize: metadataResponse.body.fileSize
		}
		// prevFile.fileID = metadataResponse.data.fileID
		// prevFile.fileHash = metadataResponse.data.fileHash
		// prevFile.fileSize = metadataResponse.body.fileSize

		files[prevFileIdx] = prevFile

		Store.set(StoreKey.files, [...files])
		Store.emit(FileUploadCompleteEvent, [...files])
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

export function updateFileStatus(fileID: string) {
	const files: UploadedFile[] = Store.get(StoreKey.files, [])
	const fileIdx = files.findIndex(f => f.fileID == fileID)

	console.log(files, fileIdx, "updatefileStatus")

	if (fileIdx < 0) {
		console.log("fileid not found")
		return
	}

	files[fileIdx].syncing = false
	files[fileIdx].currentFlag = true

	Store.set(StoreKey.files, [...files])
	Store.emit(FileUploadCompleteEvent, [...files])
}

export function parseSSEData(str: string): {} {
	console.log(str)

	return str.split(',').reduce((acc, kv) => {
		const [k, v] = kv.split(':')
		return { ...acc, [k.trim()]: v.trim() }
	}, {})
}


export const cn = function(...args: any): string {
	return args.join(" ")
}
