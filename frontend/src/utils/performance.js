let previousFrameTimestamp = 0;
const fpsSamples = [];

export function measureFPS() {
  const now = performance.now();

  if (previousFrameTimestamp === 0) {
    previousFrameTimestamp = now;
    return 0;
  }

  const frameDelta = now - previousFrameTimestamp;
  previousFrameTimestamp = now;

  if (frameDelta <= 0) {
    return 0;
  }

  const currentFps = 1000 / frameDelta;
  fpsSamples.push(currentFps);

  if (fpsSamples.length > 30) {
    fpsSamples.shift();
  }

  const rollingAverage = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
  return Number(rollingAverage.toFixed(1));
}

export function measureLatency(startTime) {
  return Number((performance.now() - startTime).toFixed(1));
}

export function logPerformance(label, value, unit) {
  if (import.meta.env.DEV) {
    console.log('Perf:', label, value, unit);
  }
}

export function checkMemoryUsage() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const used = performance.memory.usedJSHeapSize;
    const total = performance.memory.totalJSHeapSize;
    const percent = ((used / total) * 100).toFixed(1);

    if (Number(percent) > 80) {
      console.warn('High memory usage:', `${percent}%`);
    }

    return { used, total, percent };
  }

  return null;
}
