let props = {
    smoothing: 1,
    smoothingsamples: 20,
    dotcolor: 'black',
    dotopacity: 1,
    dotradius: 10,
    samples: 100,
    speedmul: 10,
    speeddrop: 100,
    curvaturecolor: true,
    pathcolor: 'black',
    pathwidth: 5,
    pathopacity: 1,
}
app = {
    set(k,v) {
        let old = props[k]
        if (old != v) {
            changes = {[k]: props[k]}
            props[k] = v
            update(changes)
        }
    },

    go() { startAnimation() },
    stop() { cancelAnimation() },
    handleDrop(e) { handleDrop(e) },

    readControl(el) {
        if (el.type == 'checkbox') {
            app.set(el.name, !!el.checked)
        }
        else if ('value' in el) {
            app.set(el.name, el.value)
        }
    },
}
window.app = app // For UI to call app methods
app.props = props
app.project = project

let plot = []
let path = null
let dot = null
let curvature = null
let tween = null
let pathLayer = null
let dotLayer = null
let speed = k => 10 / (1 + Math.abs(k*10000))

let canvas = document.getElementById('canvas')

function init() {
    for (let el of document.querySelectorAll('#controls input')) {
        app.readControl(el)
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
            document.getElementById('controls').hidden = false
            loadSVG(item.getAsFile())
            return
        }
    }
}

function loadSVG(file) {
    (new Response(file)).text().then(svg => {
        project.clear()
        project.importSVG(svg)
        const bounds = project.activeLayer.bounds
        canvas.width = bounds.width
        canvas.height = bounds.height
        document.getElementById('gobutton').disabled = false
        let paths = project.getItems({ class: Path })
        pathLayer = new Layer()
        dotLayer = new Layer()
        app.set('path', paths[0])
    })
}

function startAnimation() {
    cancelAnimation()

    if (dot) dot.remove()
    dotLayer.activate()
    dot = new Path.Circle(path.getPointAt(0), props.dotradius)
    dot.fillColor = new Color(props.dotcolor)
    dot.fillColor.alpha = props.dotopacity
    window.dot=dot

    let s = 0;
    let lastT = Date.now()
    function anim() {
        if (!dot) return
        const next = path.getPointAt(s)
        if (next) {
            dot.position = next
            const now = Date.now()
            s += speed(curvature.eval(s)) * (now - lastT)
            lastT = now
            requestAnimationFrame(anim)
        } else {
            cancelAnimation()
        }
    }
    requestAnimationFrame(anim)
}

function cancelAnimation() {
    if (tween) tween.stop()
    if (dot) dot.remove()
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
    changed = (...ary) => ary.some(x => x in changes)

    if (changed('path')) {
        path = props.path
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
            dot.fillColor = new Color(props.dotcolor)
            dot.fillColor.alpha = props.dotopacity
        }
        if (changed('dotradius')) {
            dot.scale(props.dotradius/changes.dotradius)
        }
    }
    if (changed('speedmul','speeddrop')) {
        speed = k => 0.1 * props.speedmul / (1 + Math.abs(k*100 * props.speeddrop))
        app.speed = speed
    }
}


function onFrame() {}

function sampleCurvature(path, samples=200) {
    let domain = interval(0, path.length, samples)
    return new Fn(domain, s => path.getCurvatureAt(s))
}

function plotAlongPath(path, fn, colorFunction=curvatureColor) {
    return fn.map((s, y) => {
        const p = path.getPointAt(s)
        const dot = new Path.Circle(p, props.pathwidth)
        dot.fillColor = colorFunction(y)
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

    eval(x) {
        const i = d3.bisect(this.domain, x)
        const x1 = this.domain[i-1]
        const x2 = this.domain[i]
        if (!(x1 <= x && x <= x2)) throw new Error('Bisection failed')
        const y1 = this.values[i-1]
        const y2 = this.values[i]
        return y1 + ((x-x1)/(x2-x1))*(y2-y1)
    }
    
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
        return new Fn(this.domain, out)
    }
    
    map(f) {
        return this.domain.map((x,i) => f(x, this.values[i]))
    }
}

function delay(ary, domain) {
    const measures = domain.map((offset, i) => {
        if (i == 0) 
            return domain[1] - offset
        if (i == domain.length-1) 
            return offset - domain[domain.length-2]
        return (domain[i+1] - domain[i-1])/2
    })
    //let cumulative = []
    return domain.map((offset, i) => ary[i] * measures[i])
        //.reduce((total, x, i) => cumulative[i] = total + x, 0)
    //return cumulative
}