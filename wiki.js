function openTab(evt, tabName) {
  var i, tabcontent, tablinks;

  // Hide all tab contents
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  // Remove the "active" class from all tab buttons
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }

  // Show the current tab and add "active" class to the button that opened it
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.className += " active";
}

// Automatically click the first tab on page load
document.addEventListener("DOMContentLoaded", function () {
  var defaultTab = document.getElementsByClassName("tablinks")[0];
  if (defaultTab) {
    defaultTab.click();
  }
});
