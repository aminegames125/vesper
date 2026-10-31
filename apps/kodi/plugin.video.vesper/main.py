import sys

from resources.lib import views

views.route(sys.argv[2] if len(sys.argv) > 2 else "")
