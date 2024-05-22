'use client';

import { StageFileEvent } from "@/commons/events";
import { Store } from "@/commons/store";
import { FileUploader } from "@components/fileuploader";
import { ListFiles } from "@components/listfiles";
import { useEffect, useState } from "react";
import SSEEvents from "./components/sissyevents";

export default function Home() {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const handleFileChange = (files: File[]) => {
    console.log("file change ", Array.from(files))
    setStagedFiles(Array.from(files))
  }

  useEffect(() => {
    Store.on(StageFileEvent, handleFileChange)

    return () => {
      Store.off(StageFileEvent, handleFileChange)
    }
  }, [])

  const makeEventSrcURL = () => {
    const ups = new URLSearchParams(window.location.search)
    const accessToken = ups.get("accessToken")

    ups.set("X-Access-Token", `Bearer ${accessToken}`)

    return `http://localhost:9191/subscribe/devices?${ups.toString()}`
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">

      </div>

      <div className="relative z-[-1] flex place-items-center before:absolute before:h-[300px] before:w-full before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 sm:before:w-[480px] sm:after:w-[240px] before:lg:h-[360px]">
      </div>

      <FileUploader />
      <ListFiles stagedFiles={stagedFiles} />
      <SSEEvents url={makeEventSrcURL()} />

      <div className="mb-32 grid text-center lg:mb-0 lg:w-full lg:max-w-5xl lg:grid-cols-4 lg:text-left">

      </div>
    </main>
  );
}
