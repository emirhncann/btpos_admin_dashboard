"use client";

import { ComponentType } from "react";
import { useAuth } from "@/context/AuthContext";

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-400">Yükleniyor...</p>
      </div>
    </div>
  );
}

/**
 * Sayfayı oturum gerektiren hale getirir.
 * Yönlendirme mantığı AuthProvider tarafından yönetilir.
 * Bu HOC yalnızca hydration sırasında spinner gösterir.
 *
 * Kullanım: export default withAuth(DashboardPage);
 */
export function withAuth<P extends object>(
  WrappedComponent: ComponentType<P>
) {
  function ProtectedPage(props: P) {
    const { isAuthenticated, isLoading } = useAuth();

    // Hydration tamamlanana veya oturum doğrulanana kadar spinner göster
    if (isLoading || !isAuthenticated) {
      return <LoadingSpinner />;
    }

    return <WrappedComponent {...props} />;
  }

  ProtectedPage.displayName = `withAuth(${
    WrappedComponent.displayName ?? WrappedComponent.name ?? "Component"
  })`;

  return ProtectedPage;
}
