'use client';
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { passImageUrl, type PassImageWidth } from '@/lib/pass-images';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'onError' | 'onLoad'> & {
  src?: string;
  size?: PassImageWidth;
  retryToken?: number;
  onFailure?: () => void;
};
export function PassImage(props: Props) {
  return props.src ? <ImageState key={props.src} {...props} src={props.src} /> : null;
}
function ImageState({ src, size = 256, retryToken = 0, onFailure, className = '', alt = '', loading = 'lazy', sizes = '220px', ...props }: Props & { src: string }) {
  const [status, setStatus] = useState('loading'), [attempt, setAttempt] = useState(0);
  const lastRetry = useRef(retryToken);
  useEffect(() => {
    if (status !== 'error' || attempt !== 0) return;
    const timer = setTimeout(() => { setAttempt(1); setStatus('loading'); }, 900);
    return () => clearTimeout(timer);
  }, [status, attempt]);
  useEffect(() => {
    if (lastRetry.current === retryToken) return;
    lastRetry.current = retryToken;
    if (status === 'error') { setAttempt(value => value + 1); setStatus('loading'); }
  }, [retryToken, status]);
  const imageUrl = (width: PassImageWidth) => {
    const url = passImageUrl(src, width);
    return attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url;
  };
  const optimized = passImageUrl(src, size) !== src;
  return <span className={`pass-image ${className}`} data-state={status}>
    <img {...props} src={imageUrl(size)} srcSet={optimized ? [256, 512, 1024].map(width => `${imageUrl(width as PassImageWidth)} ${width}w`).join(', ') : undefined} sizes={sizes} alt={alt} loading={loading} decoding="async"
      onLoad={() => setStatus('loaded')} onError={() => { setStatus('error'); if (attempt > 0) onFailure?.(); }} />
    {status === 'error' && attempt > 0 && <span className="pass-image-error"><ImageOff size={22} aria-hidden="true" /><span>Картинка не загрузилась</span></span>}
  </span>;
}
