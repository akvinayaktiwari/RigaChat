// The one place in the frontend that doesn't go through services/api.ts's
// fetch-based apiClient() -- fetch has no upload-progress event, so the S3
// PUT step needs its own XHR wrapper. Not a deviation to normalize away.
export function uploadFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed due to a network error'))
    xhr.onabort = () => reject(new Error('Upload was cancelled'))

    xhr.send(file)
  })
}
