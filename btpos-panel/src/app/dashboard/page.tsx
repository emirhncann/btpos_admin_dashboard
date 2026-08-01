"use client";

import { useAuth } from "@/context/AuthContext";
import { withAuth } from "@/components/withAuth";

function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gösterge Paneli</h1>
        <p className="text-gray-500 text-sm mt-1">
          Hoş geldiniz, {user?.name ?? "Admin"}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <p className="text-gray-400 text-sm text-center py-8">
          Sol menüden kasa, POS ve entegrasyon ayarlarına erişebilirsiniz.
        </p>
      </div>
    </div>
  );
}

export default withAuth(DashboardPage);
