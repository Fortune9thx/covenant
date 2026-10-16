import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Banner, Footer, HealthProvider, Nav } from "./components/Chrome";
import ErrorBoundary from "./components/ErrorBoundary";
import { Blobs } from "./components/ui";
import Agents from "./pages/Agents";
import Board from "./pages/Board";
import Checks from "./pages/Checks";
import CovenantDetail from "./pages/CovenantDetail";
import Covenants from "./pages/Covenants";
import DisputeDetail from "./pages/DisputeDetail";
import Home from "./pages/Home";
import NewCovenant from "./pages/NewCovenant";
import RegisterAgent from "./pages/RegisterAgent";

function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body, not a concise arrow: a concise arrow returns window.scrollTo's
  // value, React takes it as the cleanup function, and the tree unmounts with
  // "destroy is not a function". typecheck and build both pass either way.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <HealthProvider>
        <Blobs />
        <ScrollToTop />
        <Nav />
        <Banner />
        <main className="min-h-[70vh]">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/app/agents" element={<Agents />} />
            <Route path="/app/agents/new" element={<RegisterAgent />} />
            <Route path="/app/covenants" element={<Covenants />} />
            <Route path="/app/covenants/new" element={<NewCovenant />} />
            <Route path="/app/covenants/:id" element={<CovenantDetail />} />
            <Route path="/app/board" element={<Board />} />
            <Route path="/app/disputes/:id" element={<DisputeDetail />} />
            <Route path="/app/checks" element={<Checks />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </HealthProvider>
    </ErrorBoundary>
  );
}
