import { useCallback } from 'react';
import { wishlistPreference } from './preferences';
import { usePreference } from './usePreference';

/** ¿Se enseña la pestaña de la lista de deseos? Ver `wishlistPreference`. */
export function useShowWishlist(): { showWishlist: boolean; setShowWishlist: (on: boolean) => void } {
  const showWishlist = usePreference(wishlistPreference);
  const setShowWishlist = useCallback((on: boolean) => wishlistPreference.set(on), []);

  return { showWishlist, setShowWishlist };
}
