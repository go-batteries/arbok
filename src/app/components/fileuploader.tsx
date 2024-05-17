'use client';

import { Store, StoreKey } from "@/commons/store";
import { FileService, SetupDraggable } from "@/commons/utils";
import { FormEvent, useEffect, useRef } from "react";

export const FileUploader = () => {
    const dropRef = useRef(null);
    const fileRef = useRef(null);

    useEffect(() => {
        if (dropRef.current) {
            SetupDraggable(dropRef.current);
        }
    }, [])

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const fs = new FileService()
        const files = Store.get('uploads')

        const file = files[0]

        try {
            let metadaResponse = await fs.uploadMetadata(file)

            // console.log(metadaResponse)

            let results = await fs.uploadFile(
                file,
                metadaResponse.data.fileID,
                metadaResponse.digest,
                "blob",
            )
            // console.log("upload results ", results)

            await fs.markComplete(metadaResponse.data.fileID)
            // console.log(rr)
            alert("upload success")
        } catch (e) {
            console.error("failed to submit form", e)
            alert("failed")
        } finally {
            Store.set(StoreKey.uploads, [])
        }


        // We probably dont neeed fileType here now

    }

    return (
        <form className="w-full flex flex-col justify-center items-center" onSubmit={handleSubmit}>
            <div className="w-[80%] m-auto">
                <label
                    ref={dropRef}
                    className="flex justify-center w-full h-64 px-4 transition border-2 border-gray-300 border-dashed rounded-md appearance-none cursor-pointer hover:border-gray-400 focus:outline-none">
                    <span className="flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="font-medium text-gray-600">
                            Drop files to Attach, or
                            <span className="text-blue-600 underline inline-block ml-2">browse</span>
                        </p>
                    </span>
                    <input type="file" ref={fileRef} name="file_upload" className="hidden" />
                </label>
            </div>
            <input type="submit" className="border-2 bg-white text-black rounded-lg mt-16 px-4 py-2" value="Submit" />
        </form>
    );
}
