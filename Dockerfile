FROM fireflyiii/core:latest
COPY public/ /var/www/html/public/
COPY resources/views/ /var/www/html/resources/views/
COPY app/ /var/www/html/app/