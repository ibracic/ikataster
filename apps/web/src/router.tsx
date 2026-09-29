import { createBrowserRouter } from "react-router";
import { MapPage } from "./ui/MapPage";

export const router = createBrowserRouter([
  { path: "/", element: <MapPage /> },
  { path: "*", element: <MapPage /> },
]);
