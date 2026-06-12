/**
 * Video export utilities for exporting animations as MP4
 */

const API_BASE = process.env.REACT_APP_IMG_API || 'http://localhost:8000';

/**
 * Capture canvas element as base64 PNG
 */
export async function captureCanvasFrame(canvasElement, width = 1024, height = 768) {
  if (!canvasElement) return null;
  
  try {
    // Create a temporary canvas for rendering
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Draw the DOM element's content
    // Use html2canvas or similar library for complex DOM rendering
    // For now, we'll use a simpler approach with canvas rendering
    const svgString = serializeDOMToSVG(canvasElement);
    const canvas = await renderSVGToCanvas(svgString, width, height);
    
    if (canvas) {
      ctx.drawImage(canvas, 0, 0);
    }
    
    return tempCanvas.toDataURL('image/png');
  } catch (err) {
    console.error('Error capturing canvas frame:', err);
    return null;
  }
}

/**
 * Serialize DOM element to SVG string for canvas rendering
 */
function serializeDOMToSVG(element) {
  const rect = element.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', rect.width);
  svg.setAttribute('height', rect.height);
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  
  const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  foreignObject.setAttribute('width', rect.width);
  foreignObject.setAttribute('height', rect.height);
  foreignObject.setAttribute('x', 0);
  foreignObject.setAttribute('y', 0);
  
  const cloned = element.cloneNode(true);
  foreignObject.appendChild(cloned);
  svg.appendChild(foreignObject);
  
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Render SVG string to canvas
 */
async function renderSVGToCanvas(svgString, width, height) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.src = url;
  });
}

/**
 * Export animation as MP4 by sending frames to backend
 */
export async function exportAnimationAsMP4(frames, options = {}) {
  const {
    fps = 24,
    width = 1024,
    height = 768,
    title = 'OpenDoodler Animation',
  } = options;
  
  if (!frames || frames.length === 0) {
    throw new Error('No frames provided for export');
  }
  
  try {
    // Filter out null frames and keep only data URIs
    const validFrames = frames
      .filter((f, idx) => f && f.frameData)
      .map((frame, idx) => ({
        frame_data: frame.frameData,
        duration: frame.duration || 0.1,
        index: idx,
      }));
    
    if (validFrames.length === 0) {
      throw new Error('No valid frames for export');
    }
    
    const response = await fetch(`${API_BASE}/generate-mp4-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frames: validFrames,
        fps,
        width,
        height,
        title,
        include_audio: false,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Download the file
    await downloadMP4File(result.filename);
    
    return result;
  } catch (err) {
    console.error('MP4 export error:', err);
    throw err;
  }
}

/**
 * Download the MP4 file from backend
 */
export async function downloadMP4File(filename = 'animation.mp4') {
  try {
    const response = await fetch(`${API_BASE}/download-mp4`);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download error:', err);
    throw err;
  }
}

/**
 * Simple frame renderer using canvas 2D API
 * This captures the current visual state of a DOM element
 */
export async function renderFrameToDataURI(domElement, targetWidth = 1024, targetHeight = 768) {
  try {
    // Get the visual representation
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Get computed background style
    const element = domElement.querySelector('[style*="background"]') || domElement;
    const computedStyle = window.getComputedStyle(element);
    const bgColor = computedStyle.backgroundColor || '#ffffff';
    
    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    
    // Attempt to render SVG or text content
    const svgElements = domElement.querySelectorAll('svg');
    if (svgElements.length > 0) {
      // Render SVGs
      for (const svgEl of svgElements) {
        const rect = svgEl.getBoundingClientRect();
        const svg = new XMLSerializer().serializeToString(svgEl);
        
        const img = await new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          const blob = new Blob([svg], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          image.src = url;
        });
        
        if (img) {
          ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height);
        }
      }
    } else {
      // Render text content
      ctx.fillStyle = computedStyle.color || '#000000';
      ctx.font = `${computedStyle.fontStyle} ${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;
      
      const textElements = domElement.querySelectorAll('*');
      let y = 20;
      for (const el of textElements) {
        if (el.textContent && el.textContent.trim()) {
          ctx.fillText(el.textContent.substring(0, 50), 10, y);
          y += 30;
          if (y > targetHeight - 20) break;
        }
      }
    }
    
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Error rendering frame:', err);
    return null;
  }
}
