import { expect, type Page, test } from 'playwright/test';

const protectedRoutes = [
  '/',
  '/dashboard',
  '/tasks',
  '/projects',
  '/whatsapp',
  '/admin',
];

async function expectLoginPage(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  await expect(page.getByText(/authorized team members/i)).toBeVisible();
}

test.describe('unauthenticated CRM smoke', () => {
  test('login page renders the Google sign-in entrypoint', async ({ page }) => {
    await page.goto('/login');

    await expect(page).toHaveTitle(/Elite Build CRM/i);
    await expect(page.getByText(/sign in with your google account/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  });

  test('protected routes send unauthenticated users to login', async ({ page }) => {
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expectLoginPage(page);
    }
  });
});
