window.capture = {
    startRecording({ framerate }) {
        this.capturer = new CCapture({ 
            format: 'webm',
            framerate: framerate,
            quality: 0.95,
            name: 'capture'
        })
        this.capturer.start()
        this.recording = true
    },

    stopRecording() {
        if (this.capturer) {
            this.capturer.stop() 
            if (this.recording) {
                this.capturer.save()
            }
        }
        this.recording = false
    },

    captureFrame() {
        if (this.capturer && this.recording)
            this.capturer.capture(document.getElementById('canvas'))
    },
}