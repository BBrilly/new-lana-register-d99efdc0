import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUnregisteredLanaEvents } from "@/hooks/useUnregisteredLanaEvents";
import UnregisteredLanaTable from "@/components/UnregisteredLanaTable";

const UnregisteredOverLimitPage = () => {
  const navigate = useNavigate();
  const { rows, isLoading, totalLana, count, sortField, sortDirection, toggleSort } = useUnregisteredLanaEvents(true);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" className="mb-4 gap-2" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="p-4 sm:p-6">
          <UnregisteredLanaTable
            rows={rows} isLoading={isLoading} totalLana={totalLana} count={count}
            title="Over-Limit Unregistered Lanas"
            subtitle="Events published as Kind 87003 — exceeded limit and triggered wallet freeze."
            emptyMessage="No over-limit unregistered Lanas."
            showFrozenColumn
            sortField={sortField} sortDirection={sortDirection} toggleSort={toggleSort}
          />
        </Card>
      </div>
    </div>
  );
};

export default UnregisteredOverLimitPage;
