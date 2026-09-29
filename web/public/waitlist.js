(function () {
  var form = document.getElementById('waitlist-form');
  if (!form) return;

  var emailInput = document.getElementById('waitlist-email');
  var newsletterInput = document.getElementById('waitlist-newsletter');
  var honeypotInput = document.getElementById('waitlist-website');
  var submitButton = document.getElementById('waitlist-submit');
  var status = document.getElementById('waitlist-status');
  var turnstileContainer = document.getElementById('waitlist-turnstile');
  var turnstileSiteKey = turnstileContainer.dataset.sitekey.trim();
  var endpoint = 'https://lfsrbkrqdvzilfkphgpq.supabase.co/functions/v1/waitlist-signup';
  var defaultButtonLabel = submitButton.textContent;
  var turnstileToken = '';
  var turnstileWidgetId = null;
  var turnstileReady = false;

  function showStatus(message, state) {
    status.hidden = false;
    status.textContent = message;
    status.dataset.state = state;
  }

  function resetTurnstile(message) {
    turnstileToken = '';
    submitButton.disabled = true;
    submitButton.textContent = 'Complete security check';
    if (turnstileReady && turnstileWidgetId !== null && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
    if (message) showStatus(message, 'error');
  }

  function loadTurnstile() {
    if (!turnstileSiteKey) {
      turnstileContainer.hidden = true;
      emailInput.disabled = true;
      newsletterInput.disabled = true;
      submitButton.disabled = true;
      submitButton.textContent = 'Opening soon';
      showStatus('Beta signups will open once secure verification is configured.', 'info');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Complete security check';

    var script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = function () {
      if (!window.turnstile) {
        showStatus('The secure sign-up check did not load. Please refresh and try again.', 'error');
        return;
      }

      try {
        turnstileReady = true;
        turnstileWidgetId = window.turnstile.render(turnstileContainer, {
          sitekey: turnstileSiteKey,
          action: 'waitlist_signup',
          theme: 'auto',
          size: 'compact',
          callback: function (token) {
            turnstileToken = token;
            submitButton.disabled = false;
            submitButton.textContent = defaultButtonLabel;
            status.hidden = true;
          },
          'expired-callback': function () {
            resetTurnstile('Please complete the security check again.');
          },
          'error-callback': function () {
            turnstileToken = '';
            submitButton.disabled = true;
            submitButton.textContent = 'Complete security check';
            showStatus('The secure sign-up check failed. Please refresh and try again.', 'error');
          },
        });
      } catch {
        showStatus('The secure sign-up check could not start. Please refresh and try again.', 'error');
      }
    };
    script.onerror = function () {
      showStatus('The secure sign-up check did not load. Please refresh and try again.', 'error');
    };
    document.head.appendChild(script);
  }

  loadTurnstile();

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!emailInput.reportValidity()) return;
    if (!turnstileToken) {
      showStatus('Complete the security check before joining the beta list.', 'error');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Adding you…';
    status.hidden = true;

    try {
      var response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value,
          newsletterOptIn: newsletterInput.checked,
          website: honeypotInput.value,
          turnstileToken: turnstileToken,
        }),
      });
      var result = await response.json();

      if (!response.ok || !result.ok) throw new Error('signup failed');

      if (newsletterInput.checked && !result.newsletterEnrolled) {
        showStatus('You’re on the beta list. Newsletter signup is still syncing—please try again shortly.', 'error');
        resetTurnstile();
        return;
      }

      showStatus(
        result.betaInviteSent
          ? 'You’re in. Check your inbox for your Plated beta invite.'
          : 'You’re on the list. We’ll email you when beta access is ready.',
        'success',
      );
      Array.prototype.forEach.call(form.elements, function (element) {
        element.disabled = true;
      });
      submitButton.textContent = 'You’re on the list';
    } catch (error) {
      showStatus('We couldn’t save that just now. Please try again in a moment.', 'error');
      resetTurnstile();
    }
  });
})();
