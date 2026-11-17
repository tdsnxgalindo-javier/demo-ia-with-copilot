param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3000
)

$indexPath = Join-Path $PSScriptRoot 'index.html'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
    $listener.Start()
    Write-Host "Dashboard: http://localhost:$Port/ (Ctrl+C para detener)"
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000
            $stream.WriteTimeout = 5000
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII)
            $requestLine = $reader.ReadLine()
            if (-not $requestLine) { continue }
            while ($reader.ReadLine()) { }
            $parts = $requestLine.Split(' ')
            $method = $parts[0]
            $path = $parts[1].Split('?')[0]
            $contentType = 'text/plain; charset=utf-8'
            if ($method -ne 'GET') {
                $status = '405 Method Not Allowed'
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
            } elseif ($path -eq '/' -or $path -eq '/index.html') {
                $status = '200 OK'
                $contentType = 'text/html; charset=utf-8'
                $body = [System.IO.File]::ReadAllBytes($indexPath)
            } else {
                $status = '404 Not Found'
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
            }
            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
        } catch {
            Write-Warning $_.Exception.Message
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}