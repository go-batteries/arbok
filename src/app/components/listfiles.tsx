import { useEffect, useRef, useState } from "react";
import { FileCheck2 } from 'lucide-react';

import { Store } from "@/commons/store";
import { FileService } from "@/commons/utils";


async function fetchFiles() {
    const fs = new FileService();
    let result = await fs.fetchFiles()

    return result;
}

export const ListFiles = () => {
    const effectRan = useRef(false);
    const [files, setFiles] = useState([]);

    useEffect(() => {
        if (!effectRan.current) {
            fetchFiles().then(result => {
                if (result.success) {
                    setFiles(result.data.files || [])

                    Store.set('files', result.data.files)
                }
            })
        }

        return () => { effectRan.current = true; }
    }, [])

    return (
        <ul className="mt-8 w-[80%] mx-auto">
            {files.map((file, i) => <FileInfo details={file} key={`details_${i + 1}`} />)}
        </ul>
    );
};

const FileInfo = ({ details }: { details: any }) => {
    return <li className="flex flex-row mb-4 items-end gap-4">
        <FileCheck2 width={48} height={48} />
        <span className="inline-block text-xl">{details.fileName}</span>
    </li>
}
