# Storage server: Apache httpd. It only stores and serves the camera photos.
FROM httpd:2.4-alpine

# 1. Our extra config (directory listing for /plates/, no caching, quiet server banner)
COPY plates.conf /usr/local/apache2/conf/extra/plates.conf
RUN echo "Include conf/extra/plates.conf" >> /usr/local/apache2/conf/httpd.conf

# 2. Sample photos used to seed an empty volume on first start
COPY seed/ /seed/

# 3. Entry script: seed once, then start Apache
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# The photos folder is a volume mount point (see docker-compose.yml)
VOLUME ["/usr/local/apache2/htdocs/plates"]

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["httpd-foreground"]
