import { useEffect } from 'react';
import WhiteboardRoot from './App';

// ── Custom fonts as CSS @font-face so static text uses the same font files
//    as the animation engine. Without this, `font-family: 'Open Sans'`
//    falls back to system sans-serif and looks different from animated paths.
const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '';
const CSS_FONTS = [
  { family: 'Open Sans',      url: `${base}/OpenSans-Regular.ttf`,      weight: '400', style: 'normal' },
  { family: 'Pacifico',       url: `${base}/Pacifico-Regular.ttf`,       weight: '400', style: 'normal' },
  { family: 'Caveat',         url: `${base}/Caveat-Regular.ttf`,         weight: '400', style: 'normal' },
  { family: 'Dancing Script', url: `${base}/DancingScript-Regular.ttf`,  weight: '400', style: 'normal' },
];

let fontsLoaded = false;

function loadWhiteboardFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;

  Promise.all(
    CSS_FONTS.map(({ family, url, weight, style }) => {
      const ff = new FontFace(family, `url(${url})`, { weight, style });
      return ff.load().then(loaded => {
        document.fonts.add(loaded);
      }).catch(err => console.warn(`Whiteboard font load failed: ${family}`, err));
    })
  ).catch(() => {}); // never block render
}

// Entry point for the embedded Whiteboard Animation tool.
// Mounted as a route inside the main React Animation Maker app.
export default function WhiteboardApp() {
  useEffect(() => {
    loadWhiteboardFonts();
  }, []);

  return <WhiteboardRoot />;
}