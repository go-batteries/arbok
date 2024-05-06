import crypto from "crypto"
import { fileTypeFromBuffer } from 'file-type';
import { cookies } from 'next/headers'

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

function preventDefaults(e) {
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

	handleFiles(files);
}

function handleFiles(files: FileList) {
	// Add your file upload logic here
	console.log('Files to upload:', files);
}

const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB

type Ffile = {
	buff: Blob,
	id: number
	name: string,
	t: string,
	size: number,
}


const DOMAIN = window.location.origin;


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
		const hashAsBuff = await crypto.subtle.digest("SHA-256", buff);

		const uint8ViewOfHash = new Uint8Array(hashAsBuff);
		const hashDigestHex = Array.from(uint8ViewOfHash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		let fileType = null;

		if (withType)
			fileType = await fileTypeFromBuffer(buff);

		return {
			digest: hashDigestHex,
			fileType,
		};
	},


	getAccessTokenFromCookie() {
		const cookystore = cookies();
		return cookystore.get('access_token');
	}
}


var PARALLEL_STREAMS = 3;

const buildAuthTokenHeader = (): {} => {
	return {
		'X-Access-Token': `Bearer ${FileUtils.getAccessTokenFromCookie()}`
	}
}

class FileService {
	async uploadMetadata(file: File) {
		const fileInfo = await FileUtils.digestBlob(file, true);
		const body = {
			name: file.name,
			size: file.size,
			digest: fileInfo.digest,
			fileType: fileInfo.fileType,
		};

		checkAccessToken()


		fetchJSON(`${DOMAIN}/my/files`, {
			method: 'POST',
			headers: {
				...buildAuthTokenHeader(),
			},
			body: body,
		}).then(data => {
			console.log(data);
			alert("done")
		}).catch(err => {
			console.error(err);
			alert("retry")
		})
	}

	async uploadFile(file: File, streamID: string, fileType: string) {
		let chunks = await this.chunkFile(file);

		const chunkSize = chunks.length;
		let groups = <Array<Array<any>>>[];

		for (let i = 0; i < chunkSize; i += PARALLEL_STREAMS) {
			groups.push(chunks.slice(i, Math.min(i + PARALLEL_STREAMS, chunkSize)))
		}

		const chunkResult = []

		// use only n_PARALLEL STREAMS
		for (let chunk of groups) {
			let res = await Promise.allSettled(chunk.map((ffile: Ffile) => {
				const body = new FormData();

				body.append("streamID", streamID);
				body.append("data", ffile.buff);
				// Object.entries(ffile).map(())
				//
				body.append("name", encodeURIComponent(ffile.name));
				body.append("fileType", fileType);
				body.append("size", `${ffile.size}`);
				body.append("id", `${ffile.id}`);

				await fetch(`${DOMAIN}/my/files/upload?streamID=${streamID}`, {
					method: 'POST',
					headers: {
						...buildAuthTokenHeader(),
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

	}

	async chunkFile(file: File): Promise<Ffile[]> {
		let chunks = [];
		let start = 0;

		while (start < file.size) {
			const buff = file.slice(start, start + CHUNK_SIZE);
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

function handleFile(file: File): Ffile[] {


	return chunks
}



function
