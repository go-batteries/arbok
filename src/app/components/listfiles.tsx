import { useEffect, useRef, useState } from "react";
import { FileCheck2 } from 'lucide-react';

import { Store, StoreKey } from "@/commons/store";
import { FileService, cn } from "@/commons/utils";


async function fetchFiles() {
    const fs = new FileService();
    let result = await fs.fetchFiles()

    return result;
}

export const ListFiles = (props: { stagedFiles: File[] }) => {
    const effectRan = useRef(false);
    const [files, setFiles] = useState<File[]>([]);
    const stagedFiles = props.stagedFiles;

    useEffect(() => {
        const unsubscribe = () => { effectRan.current = true; }

        if (effectRan.current) {
            return unsubscribe
        }

        fetchFiles().then(result => {
            if (!result.success) {
                // handle errors here.
                console.log("err", result.body?.error?.message)
                throw new Error('something went wrong')
            }
            return result.body?.data
        }).then(data => {
            setFiles(data.files || [])

            Store.set(StoreKey.files, data.files)
        }).catch(e => {
            console.error(e)
        })

        return unsubscribe;
    }, [])

    return (
        <div className="w-full">
            <div className={cn(stagedFiles.length > 0 ? "block" : "hidden", "w-[80%] mx-auto")}>
                <h2 className="font-bold text-lg">Awaiting upload</h2>
                <ul className="mt-8 staging-area area-wrapper">
                    {stagedFiles.map((file, i) => <FileInfo details={file} key={`details_${i + 1}`} />)}
                </ul>
            </div>
            <div className={cn(files.length > 0 ? "block" : "hidden", "w-[80%] mx-auto mt-16")}>
                <h2 className="font-bold text-lg">Your files</h2>
                <ul className="mt-8 synced-area area-wrapper">
                    {files.map((file, i) => <FileInfo details={file} key={`details_${i + 1}`} />)}
                </ul>
            </div>
        </div>
    );
};

const FileInfo = ({ details }: { details: any }) => {
    const handleDownload = async (e: any, fileID: string) => {
        const fs = new FileService()

        await fs.fetchFileChunks(fileID)

    }

    return <li className="flex flex-row mb-4 items-end gap-4">
        <FileCheck2 width={32} height={32} />
        <span className="inline-block text-xl">{details.fileName || details.name}</span>
        <a href="#" onClick={(e) => handleDownload(e, details.fileID)}>Download</a>
    </li>
}
