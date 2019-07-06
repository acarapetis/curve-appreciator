let props = {
    smoothing: 1,
    smoothingsamples: 20,
    dotcolor: 'black',
    dotopacity: 1,
    dotradius: 10,
    samples: 100,
    speedmul: 10,
    speeddrop: 100,
    curvaturezero: 1,
    curvaturecolor: true,
    pathcolor: 'black',
    pathwidth: 5,
    pathopacity: 1,
    direction: 'forward',
    framerate: 60,
    record: false,
}
let ignoreProps = ['path','smoothingsamples'] // don't save these
const app = {
    set(k,v) {
        let old = props[k]
        if (old != v) {
            const changes = {[k]: props[k]}
            props[k] = v
            update(changes)
        }
    },

    saveToClipboard() {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(this.save())
        }
        else if (!window.isSecureContext) {
            window.alert("Clipboard functionality only works in secure mode. Replace http with https in the address bar.")
        }
        else {
            window.alert("Your browser does not support clipboard functionality.")
        }
    },
    async loadFromClipboard() {
        if (navigator.clipboard) {
            this.load(await navigator.clipboard.readText())
        }
        else if (!window.isSecureContext) {
            window.alert("Clipboard functionality only works in secure mode. Replace http with https in the address bar.")
        }
        else {
            window.alert("Your browser does not support clipboard functionality.")
        }
    },
    save() {
        let payload = {...props}
        for (let k of ignoreProps) delete payload[k]
        return JSON.stringify(payload, null, 2)
    },
    load(str) {
        const payload = JSON.parse(str)
        this.props = props = { ...props, ...payload }
        update(props)
        Object.keys(payload).forEach(this.setControl)
    },

    go() { startAnimation() },
    stop() { cancelAnimation() },
    handleDrop(e) { handleDrop(e) },

    readControl(el) {
        if (!el) return
        if (el.type == 'checkbox') {
            app.set(el.name, !!el.checked)
        }
        else if (el.type == 'number') {
            app.set(el.name, Number(el.value))
        }
        else if ('value' in el) {
            app.set(el.name, el.value)
        }
    },

    setControl(key) {
        const el = document.querySelector(`*[name="${key}"]`)
        const val = props[key]
        if (el.type == 'checkbox') {
            el.checked = val
        }
        else if (el.type == 'radio') {
            document.querySelector(`input[name="${key}"][value="${val}"]`).checked = true
        }
        else if ('value' in el) {
            el.value = val
        }
    },

    resetConfig() {
        resetToDefaults()
    }
}
function savePropsToStorage() {
    localStorage.setItem('curve-appreciator-config', app.save())
}
function loadPropsFromStorage() {
    const conf = localStorage.getItem('curve-appreciator-config')
    if (conf) {
        app.load(conf)
        return true
    }
    return false
}
function resetToDefaults() {
    localStorage.removeItem('curve-appreciator-config')
    window.location.reload()
}
window.app = app // For UI to call app methods
app.props = props
app.project = project

let plot = []
let path = null
let pathLength = null
let dot = null
let curvature = null
let tween = null
let pathLayer = null
let dotLayer = null
let nextFrame = null
let capturer = null
let speed = k => 10 / (1 + Math.abs(k*10000))

let canvas = document.getElementById('canvas')

function init() {
    if (!loadPropsFromStorage()) {
        for (let el of document.querySelectorAll('#controls input')) {
            if (el.type != 'radio' || el.checked)
                app.readControl(el)
        }
    }

    let text = new PointText(new Point(50, 50))
    text.fillColor = 'black'
    text.content = 'Drag and drop an SVG here to begin.'
    text.style.fontSize = 24
}

init()

function handleDrop(e) {
    e.preventDefault()
    for (let item of e.dataTransfer.items || []) {
        if (item.kind === 'file') {
            loadSVG(item.getAsFile())
            return
        }
    }
}

async function loadSVG(file) {
    const svg = await new Response(file).text()

    project.clear()
    project.importSVG(svg)

    // Resize canvas to SVG size
    const bounds = project.activeLayer.bounds
    canvas.style.width = bounds.width + 'px'
    canvas.style.height = bounds.height + 'px'

    // Let Paper.js know that the canvas size has changed
    window.dispatchEvent(new window.Event('resize'))

    document.getElementById('gobutton').disabled = false
    let paths = project.getItems({ class: Path })
    pathLayer = new Layer()
    dotLayer = new Layer()
    app.set('path', paths[0])
}

function startAnimation() {
    cancelAnimation()

    function position(t) {
        const l = pathLength
        switch(app.props.direction) {
            case 'forward':
                return t
            case 'backward':
                return l - t
            case 'infinite':
                t = t % (2*l)
            case 'bounce':
                if (t < l) 
                    return t
                else
                    return 2 * l - t
            case 'bouncerev':
                if (t < l) 
                    return l - t
                else
                    return t - l
        }
    }

    if (dot) dot.remove()
    dotLayer.activate()
    dot = new Path.Circle(path.getPointAt(position(0)), props.dotradius)
    dot.fillColor = props.dotcolor
    dot.fillColor.alpha = props.dotopacity
    window.dot=dot

    if (props.record) {
        window.capture.startRecording(props)
        window.capture.captureFrame()
    }

    let t = 0;
    let lastT = performance.now()
    function anim() {
        if (!dot) return
        if (props.record) {
            window.capture.captureFrame()
        }
        let s = position(t)
        const next = s >= 0 && path.getPointAt(s)
        if (next) {
            dot.position = next
            const now = performance.now()
            t += speed(curvature.eval(s)) * (now - lastT)
            lastT = now
            nextFrame = requestAnimationFrame(anim)
        } else {
            cancelAnimation()
        }
    }
    nextFrame = requestAnimationFrame(anim)
}

function cancelAnimation() {
    window.capture.stopRecording()
    if (tween) tween.stop()
    if (dot) dot.remove()
    if (nextFrame) cancelAnimationFrame(nextFrame)
    dot = null
}

function renderPath() {
    for (d of plot) d.remove()
    if (!path) return
    pathLayer.activate()
    if (props.curvaturecolor) {
        plot = plotAlongPath(path, curvature)
        path.strokeWidth = 0
    } else {
        path.strokeWidth = props.pathwidth
        path.strokeColor = props.pathcolor
        path.strokeColor.alpha = props.pathopacity
    }
}

function update(changes={}) {
    savePropsToStorage()

    changed = (...ary) => ary.some(x => x in changes)

    if (changed('path')) {
        path = props.path
        pathLength = path.length
        app.path = path
    }
    if (changed('path','samples','smoothingsamples','smoothing')) {
        if (!path) return
        curvature = sampleCurvature(path, props.samples)
        if (props.smoothing != 0)
            curvature = curvature.smooth(1/props.smoothing, props.smoothingsamples)

        renderPath()
    }
    if (changed('curvaturecolor','pathcolor','pathwidth','pathopacity')) {
        renderPath()
    }
    if (dot) {
        if (changed('dotcolor','dotopacity')) {
            dot.fillColor = props.dotcolor
            dot.fillColor.alpha = props.dotopacity
        }
        if (changed('dotradius')) {
            dot.scale(props.dotradius/changes.dotradius)
        }
    }
    if (changed('speedmul','speeddrop','curvaturezero')) {
        const threshold = props.curvaturezero
        speed = k => 0.1 * props.speedmul / (1 + Math.abs(Math.max(0,k*100 - threshold) * props.speeddrop))
    }
}

function sampleCurvature(path, samples=200) {
    let domain = interval(0, path.length, samples)
    return new Fn(domain, s => path.getCurvatureAt(s))
}

function plotAlongPath(path, fn, colorFunction=curvatureColor) {
    return fn.map((s, y) => {
        const p = path.getPointAt(s)
        const dot = new Path.Circle(p, props.pathwidth/2)
        dot.fillColor = colorFunction(y)
        dot.fillColor.alpha = props.pathopacity
        return dot
    })
}

const black = new Color('black')
const red = new Color('red')
function curvatureColor(k) {
    const t = 1 / (1 + Math.abs(k*100))
    return black * t + red * (1-t)
}

function range(a,b) {
    if (b !== undefined) {
        var start = a, end = b
    } else {
        var start = 0, end = a
    }
    return [...Array(end-start).keys()].map(x => x+start)
}

function interval(start, end, samples) {
    return range(samples)
        .map(x => start + (end-start) * x/(samples-1))
}

// A scalar function sampled over a discrete domain.
class Fn {
    constructor(domain, values) {
        this.domain = domain
        if (values instanceof Array) {
            if (values.length != domain.length)
                throw new Error('Bad length')
            this.values = values
        } else if (values instanceof Function) {
            this.values = this.domain.map(values)
        }
    }

    max() { return Math.max(...this.values) }
    min() { return Math.min(...this.values) }

    // Linearly interpolate to approximate the value of this function at x.
    eval(x) {
        if (x <= this.domain[0]) return this.domain[0]
        if (x >= this.domain[this.domain.length - 1]) return this.domain[this.domain.length - 1]
        const i = d3.bisect(this.domain, x)
        const x1 = this.domain[i-1]
        const x2 = this.domain[i]
        if (!(x1 <= x && x <= x2)) {
            console.log({x1,x2,x,i})
            throw new Error('Bisection failed')
        }
        const y1 = this.values[i-1]
        const y2 = this.values[i]
        return y1 + ((x-x1)/(x2-x1))*(y2-y1)
    }
    
    // Return a smoothed version of this function (via Gaussian blur)
    smooth(k, samples=10) {
        const resolution = this.domain[1] - this.domain[0] // TODO
        const mult = Math.pow(resolution/samples,2)
        const f = x => Math.exp(-k*x*x*mult)
        let kernel = interval(-samples, samples, 2*samples + 1).map(f)
        const sum = kernel.reduce((a,b) => a+b)
        kernel = kernel.map(x => x/sum)

        let out = []
        for (let i = 0; i < this.domain.length; i++) {
            let acc = 0
            for (let j = 0; j <= 2 * samples; j++) {
                let x = i + j - samples
                if (x < 0) 
                    x = 0
                if (x > this.domain.length - 1) 
                    x = this.domain.length - 1
                acc += kernel[j]*this.values[x]
            }
            out[i] = acc
        }
        return new Fn([...this.domain], out)
    }
    
    map(f) {
        return this.domain.map((x,i) => f(x, this.values[i]))
    }
}