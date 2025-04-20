// public/auth.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message'); // For registration

    // --- Utility Functions ---
    function showMessage(element, message, isError = true) {
        if (element) {
            element.textContent = message;
            element.style.display = message ? 'block' : 'none';
            element.className = isError ? 'error-text' : 'success-text';
        }
    }

    function clearMessages() {
        showMessage(errorMessage, '', true);
        showMessage(successMessage, '', false);
    }

    // --- Login Form Handler ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearMessages();

            const username = loginForm.username.value;
            const password = loginForm.password.value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message || 'Login failed.');
                }

                console.log('Login successful:', result);
                // Redirect based on role
                if (result.user && result.user.isAdmin) {
                    window.location.href = '/admin.html'; // Redirect admin
                } else {
                    window.location.href = '/index.html'; // Redirect regular user
                }

            } catch (error) {
                console.error('Login error:', error);
                showMessage(errorMessage, error.message, true);
            }
        });
    }

    // --- Register Form Handler ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearMessages();

            const username = registerForm.username.value;
            const password = registerForm.password.value;
            const confirmPassword = registerForm['confirm-password'].value; // Access using brackets

            if (password !== confirmPassword) {
                showMessage(errorMessage, 'Passwords do not match.', true);
                return;
            }
             if (password.length < 6) { // Basic password length check
                showMessage(errorMessage, 'Password must be at least 6 characters long.', true);
                return;
            }

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                });

                const result = await response.json();

                if (!response.ok) {
                     // Status 409 is 'Conflict' (username exists)
                    if (response.status === 409) {
                         throw new Error(result.message || 'Username is already taken.');
                    }
                    throw new Error(result.message || 'Registration failed.');
                }

                console.log('Registration successful:', result);
                showMessage(successMessage, result.message || 'Registration successful! Please log in.', false);
                registerForm.reset();
                 // Optional: Redirect to login after a short delay
                setTimeout(() => {
                     window.location.href = '/login.html';
                 }, 2000);

            } catch (error) {
                console.error('Registration error:', error);
                showMessage(errorMessage, error.message, true);
            }
        });
    }
});

// Dark mode toggle functionality
document.addEventListener('DOMContentLoaded', function() {
  const themeToggle = document.getElementById('theme-toggle');
  
  // Check for saved theme preference or default to light mode
  if (localStorage.getItem('theme') === 'dark' || 
     (window.matchMedia('(prefers-color-scheme: dark)').matches && 
      !localStorage.getItem('theme'))) {
    document.body.classList.add('dark-mode');
  }
  
  // Handle toggle click
  themeToggle.addEventListener('click', () => {
    // Toggle dark mode class on body
    document.body.classList.toggle('dark-mode');
    
    // Save preference to localStorage
    if (document.body.classList.contains('dark-mode')) {
      localStorage.setItem('theme', 'dark');
    } else {
      localStorage.setItem('theme', 'light');
    }
  });
});