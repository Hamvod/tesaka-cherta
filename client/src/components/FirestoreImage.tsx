import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { firestoreImageId, getAuctionImageData } from "@/lib/firestoreImages";

const PLACEHOLDER = "/auction-placeholder.svg";

type Props = { imagePath: string; alt: string; className?: string; eager?: boolean };

export default function FirestoreImage({ imagePath, alt, className, eager = false }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [nearViewport, setNearViewport] = useState(eager);
  const imageId = firestoreImageId(imagePath);

  useEffect(() => {
    if (!imageId || eager || !imageRef.current || !("IntersectionObserver" in window)) {
      if (imageId) setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(imageRef.current);
    return () => observer.disconnect();
  }, [imageId, eager]);

  const imageQuery = useQuery({
    queryKey: ["firestore-auction-image", imageId],
    queryFn: () => getAuctionImageData(imagePath),
    enabled: Boolean(imageId && nearViewport),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  const safeInline = imagePath.startsWith("data:image/jpeg;base64,") ? imagePath : null;
  const src = safeInline ?? (imageId ? imageQuery.data ?? PLACEHOLDER : PLACEHOLDER);
  return <img ref={imageRef} src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" />;
}
