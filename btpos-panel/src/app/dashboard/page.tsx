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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Aktif Görevler"   value="—" color="blue"   />
        <StatCard label="Toplam Kullanıcı" value="—" color="green"  />
        <StatCard label="Sözleşmeler"      value="—" color="purple" />
        <StatCard label="Kategoriler"      value="—" color="orange" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <p className="text-gray-400 text-sm text-center py-8">
          İçerik yakında burada görünecek.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${colors[color]} mb-3`}>
        <span className="text-sm font-bold">—</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default withAuth(DashboardPage);
