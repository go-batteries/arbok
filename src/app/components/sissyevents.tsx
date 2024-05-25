import { parseSSEData, updateFileStatus } from "@/commons/utils"
import { useEffect, useState } from "react"

const ErrConnClosed = new Error("connection_closed")

export function SetupEventSource(url: string, fn: Function) {
    console.log("connecting to sse")

    const source = new EventSource(url, { withCredentials: true })

    source.onmessage = (event: MessageEvent) => {
        fn(null, event.data)
    }

    source.onerror = (event: any) => {
        console.log('Error: ', event.target.readyState)
        source.close();

        if (event.target.readyState == 2) {
            fn(ErrConnClosed, null)
        }
    }

    return () => {
        source.close()
    }
}

export default function SSEEvents(props: { url: string }) {
    const [messages, setMessages] = useState<string[]>([]);
    const [reconnect, shouldReconnect] = useState<boolean>(false);


    useEffect(() => {
        const evtSrcCloser = SetupEventSource(
            props.url,
            (err: Error, data: string) => {
                if (err != null) {
                    shouldReconnect(true)
                    return
                }

                const resp = parseSSEData(data)
                console.log("sse event ", resp, resp.fileID);
                updateFileStatus(resp.fileID)
                setMessages(messages => [...messages, data])
            }
        )

        return () => {
            console.log("closing")
            evtSrcCloser()
        }

    }, [reconnect])

    return (
        <ul>
            {messages.map((msg, i) => <li key={`${i}`}>{msg}</li>)}
        </ul>
    )
}
