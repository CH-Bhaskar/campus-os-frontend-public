import type { RouteObject } from 'react-router';

// Paths are relative to /tracks/docdesk.
export const routes: RouteObject[] = [
  {
    index: true,
    lazy: async () => {
      const { DocDeskPage } = await import('./screens/DocDeskPage');
      return {
        Component: () => (
          <div className="docdesk-scope">
            <DocDeskPage />
          </div>
        ),
      };
    },
  },
];
