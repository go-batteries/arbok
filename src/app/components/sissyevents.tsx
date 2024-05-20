import { useEffect, useState } from "react"

export function SetupEventSource(url: string, fn: Function) {
    const source = new EventSource(url, { withCredentials: true })

    source.onmessage = (event) => {
        console.log(event.data, "data")
        fn(event.data)
    }

    source.onerror = () => {
        console.log('Error: ')
        source.close();
    }


    return () => {
        source.close()
    }
}

export default function SSEEvents(props: { url: string }) {
    const [messages, setMessages] = useState<string[]>([]);

    useEffect(() => {
        const evtSrcCloser = SetupEventSource(
            props.url,
            (data: string) => {
                console.log([...messages, data])
                setMessages(messages => [...messages, data])
            }
        )

        return () => {
            evtSrcCloser()
        }

    }, [])

    return (
        <ul>
            {messages.map((msg, i) => <li key={`${i}`}>{msg}</li>)}
        </ul>
    )
}
