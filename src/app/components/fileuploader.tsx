'use client';

import { SetupDraggable } from "@/commons/utils";
import { useEffect, useRef } from "react";

export const FileUploader = () => {
    const dropRef = useRef(null);

    useEffect(() => {
        if (dropRef.current)
            SetupDraggable(dropRef.current);
    }, [])

    return (
        <div className="w-[80%]">
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
                <input type="file" name="file_upload" className="hidden" />
            </label>
        </div>
    );
}